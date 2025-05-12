import os
import json
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key
import datetime

# 環境変数にテーブル名とインデックス名を設定
TABLE_NAME = os.environ.get('TABLE_NAME', 'MessageBuffer')

# DynamoDB リソース初期化
print(f"[INIT] TABLE_NAME={TABLE_NAME}")
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    # 受信イベントを丸ごとログ
    print("[EVENT]", json.dumps(event, ensure_ascii=False))

    # 1) クエリパラメータ取得
    params = event.get('queryStringParameters') or {}
    print(f"[PARAMS] {params}")
    device_id = params.get('device_id')
    start     = params.get('start')
    end       = params.get('end')
    fmt       = params.get('format', 'json').lower()

    # バリデーション
    if not device_id or not start or not end:
        print("[ERROR] Missing parameters")
        return _resp(400, {'error': 'device_id, start, end が必須です'})

    try:
        start = int(start)
        end   = int(end)
    except ValueError:
        print(f"[ERROR] Invalid integer: start={start}, end={end}")
        return _resp(400, {'error': 'start, end はエポック秒の整数で指定してください'})

    # 2) GSI を使って Query（ページネーション対応）
    print(f"[QUERY] device_id={device_id}, start={start}, end={end}")
    try:
        all_items = []
        resp = table.query(
            KeyConditionExpression=(
                Key('device_id').eq(device_id) &
                Key('sequence_number').between(start, end)
            ),
            ScanIndexForward=True
        )
        all_items.extend(resp.get('Items', []))

        # LastEvaluatedKey がある限り、次ページを取得
        while 'LastEvaluatedKey' in resp:
            resp = table.query(
                KeyConditionExpression=(
                    Key('device_id').eq(device_id) &
                    Key('sequence_number').between(start, end)
                ),
                ScanIndexForward=True,
                ExclusiveStartKey=resp['LastEvaluatedKey']
            )
            all_items.extend(resp.get('Items', []))

        items = all_items
        print(f"[RESULT] Found total {len(items)} items")
    except Exception as e:
        print(f"[ERROR] DynamoDB query failed: {e}")
        return _resp(500, {'error': '内部サーバーエラー'})

    # 3) レスポンス前に型変換: Decimal やリスト内 Decimal を数値に
    def _dec(v):
        if isinstance(v, Decimal):
            return int(v) if v % 1 == 0 else float(v)
        if isinstance(v, list):
            return [_dec(x) for x in v]
        return v

    clean = [{k: _dec(v) for k, v in it.items()} for it in items]
    print(f"[PREP] Cleaned items count={len(clean)}")

    # 4) CSV 応答 or JSON 応答
    if fmt == 'csv':
        csv_body = _to_csv(clean)
        filename = f"{device_id}_{start}_{end}.csv"
        print(f"[RESPONSE] CSV, filename={filename}")
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'text/csv',
                'Content-Disposition': f'attachment; filename="{filename}"'
            },
            'body': csv_body
        }

    print(f"[RESPONSE] JSON, count={len(clean)}")
    return _resp(200, clean)


def _to_csv(items):
    # ヘッダー
    cols = ['datetime', 'rssi', 'temperature', 'avgVol.', 'voltages']
    lines = [','.join(cols)]
    for it in items:
        # 基本情報
        seq = it.get('sequence_number', 0)
        base_epoch = seq * 180  # 秒
        raw_rssi = it.get('rssi', None)
        raw_temp = it.get('temperature', None)

        # 数値フォーマット
        rssi_str = f'{raw_rssi:.2f}' if isinstance(raw_rssi, (int, float)) else ''
        temp_str = f'{raw_temp:.2f}' if isinstance(raw_temp, (int, float)) else ''

        vs = it.get('voltages', [])

        # 20 点ずつのチャンクに分割
        for i in range(0, len(vs), 20):
            chunk = vs[i:i+20]
            # JST 時刻
            dt_utc = datetime.datetime.fromtimestamp(base_epoch + i* (60/20), tz=datetime.timezone.utc)
            # 上の計算がちょっとわかりにくいので明示的に分単位で：
            # dt_utc = datetime.datetime.fromtimestamp(base_epoch + (i//20)*60, tz=datetime.timezone.utc)
            # のほうが安全です
            dt_jst = dt_utc.astimezone(datetime.timezone(datetime.timedelta(hours=9)))
            time_str = dt_jst.strftime('%Y/%m/%d %H:%M')

            # 平均
            avg = sum(chunk) / len(chunk) if chunk else 0
            avg_str = f'{avg:.2f}'

            # チャンク内 voltages
            voltages_str = '"' + ';'.join(f'{v:.2f}' for v in chunk) + '"'

            # 行を組み立て
            row = [
                time_str,
                rssi_str,
                temp_str,
                avg_str,
                voltages_str
            ]
        lines.append(','.join(row))

    return '\n'.join(lines)

def _resp(code, body):
    return {
        'statusCode': code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False)
    }
