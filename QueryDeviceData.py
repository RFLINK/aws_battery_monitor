import os
import json
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key
import datetime

# 環境変数にテーブル名を設定
TABLE_NAME = os.environ.get('TABLE_NAME', 'MessageBuffer')

# DynamoDB リソース初期化
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(TABLE_NAME)


def lambda_handler(event, context):
    print("[EVENT]", json.dumps(event, ensure_ascii=False))

    # 1) クエリパラメータ取得\    
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

    # 2) DynamoDB Query (ページネーション対応)
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

        # 3) ping 用 seq=0 レコードを除外
        # filtered = [item for item in all_items if item.get('sequence_number', 0) != 0]
        filtered = all_items
        print(f"[RESULT] Retrieved {len(all_items)} items, filtered to {len(filtered)} (seq!=0)")

    except Exception as e:
        print(f"[ERROR] DynamoDB query failed: {e}")
        return _resp(500, {'error': '内部サーバーエラー'})

    # 4) 型変換: Decimal -> 数値、リスト内も変換
    def _dec(v):
        if isinstance(v, Decimal):
            return int(v) if v % 1 == 0 else float(v)
        if isinstance(v, list):
            return [_dec(x) for x in v]
        return v

    clean = [{k: _dec(v) for k, v in it.items()} for it in filtered]
    print(f"[PREP] Cleaned items count={len(clean)}")

    # 5) レスポンス: JSON or CSV
    if fmt == 'csv':

        # JST タイムゾーン定義
        jst = datetime.timezone(datetime.timedelta(hours=9))
        # start/end を JST の datetime に変換
        start_dt = datetime.datetime.fromtimestamp(start*180,   tz=jst)
        end_dt   = datetime.datetime.fromtimestamp(end*180+60*2,tz=jst)
        # 好みのフォーマットに整形（例: 20250525_142300 の形式）
        start_str = start_dt.strftime('%Y%m%d_%H%M')
        end_str   = end_dt.strftime('%Y%m%d_%H%M')
        # ファイル名
        filename = f"{device_id}_{start_str}_{end_str}.csv"

        csv_body = _to_csv(clean)
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
    cols = ['datetime', 'rssi', 'temperature', 'avgVol.', 'voltages']
    lines = [','.join(cols)]

    for it in items:
        seq = it.get('sequence_number', 0)
        base_epoch = seq * 180
        rssi = it.get('rssi')
        temp = it.get('temperature')
        vs   = it.get('voltages', [])

        rssi_str = f"{rssi:.2f}" if isinstance(rssi, (int, float)) else ''
        temp_str = f"{temp:.2f}" if isinstance(temp, (int, float)) else ''

        # 20点ずつチャンク
        for i in range(0, len(vs), 20):
            chunk = vs[i:i+20]
            dt_utc = datetime.datetime.fromtimestamp(
                base_epoch + (i//20)*60,
                tz=datetime.timezone.utc
            )
            dt_jst = dt_utc.astimezone(datetime.timezone(datetime.timedelta(hours=9)))
            time_str = dt_jst.strftime('%Y/%m/%d %H:%M')

            avg = sum(chunk)/len(chunk) if chunk else 0
            avg_str = f"{avg:.2f}"
            volt_str = '"' + ';'.join(f"{v:.2f}" for v in chunk) + '"'

            lines.append(','.join([time_str, rssi_str, temp_str, avg_str, volt_str]))

    return '\n'.join(lines)


def _resp(code, body):
    return {
        'statusCode': code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False)
    }
