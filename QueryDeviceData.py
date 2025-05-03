import os
import json
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key

# 環境変数にテーブル名とインデックス名を設定
TABLE_NAME = os.environ.get('TABLE_NAME', 'MessageBuffer')
INDEX_NAME = os.environ.get('INDEX_NAME', 'TimestampIndex')

# DynamoDB リソース初期化
print(f"[INIT] TABLE_NAME={TABLE_NAME}, INDEX_NAME={INDEX_NAME}")
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

    # 2) GSI を使って Query
    print(f"[QUERY] device_id={device_id}, start={start}, end={end}")
    try:
        resp = table.query(
            IndexName=INDEX_NAME,
            KeyConditionExpression=(
                Key('device_id').eq(device_id) &
                Key('timestamp').between(start, end)
            ),
            ScanIndexForward=True
        )
        items = resp.get('Items', [])
        print(f"[RESULT] Found {len(items)} items")
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
    cols = ['gateway_id', 'device_id', 'sequence_number',
            'timestamp', 'rssi', 'temperature', 'humidity', 'voltages']
    lines = [','.join(cols)]
    for it in items:
        row = []
        for c in cols:
            v = it.get(c, '')
            if isinstance(v, list):
                row.append('"' + ';'.join(str(x) for x in v) + '"')
            else:
                row.append(str(v))
        lines.append(','.join(row))
    return '\n'.join(lines)


def _resp(code, body):
    return {
        'statusCode': code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False)
    }
