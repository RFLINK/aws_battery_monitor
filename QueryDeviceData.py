import os
import json
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key
import datetime
import time

# 環境変数にテーブル名を設定
TABLE_NAME = os.environ.get('TABLE_NAME', 'MessageBuffer')
IOT_REGION = 'ap-northeast-1'
iot = boto3.client('iot-data', region_name=IOT_REGION)

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

    # 8) 追加：DB 参照用 device_id をペイロードに、seq=0 でパブリッシュ
    try:
        # 「device_id」で降順クエリ、最新1件を取る
        latest = table.query(
            KeyConditionExpression=Key('device_id').eq(device_id),
            ScanIndexForward=False,  # 降順
            Limit=1
        ).get('Items', [])

        if latest:
            latest_gw = latest[0].get('gateway_id')
            print(f"[INFO] Latest gateway_id for {device_id}: {latest_gw}")
        else:
            latest_gw = None
            print(f"[WARN] No items found for {device_id}, gateway_id 未設定")

        # トピックは latest_gw を使い、payload は device_id + seq=0
        custom_payload = {
            'destination': 'gateway',
            'gateway_id': latest_gw,
            'device_id': device_id,    # DBキーとして使っている ID
            'sequence_number': 0,      # 固定で 0 番
            'timestamp': int(time.time()),
            'status': 'ack'
        }
        topic = f"battery-monitor/{latest_gw}/down/ack"
        iot.publish(
            topic=topic,
            qos=0,
            payload=json.dumps(custom_payload)
        )
        print(f"[PUBLISH] Custom publish to {topic}: {custom_payload}")
    except ClientError as e:
        # ClientError を潰してログだけ残す
        err = e.response.get('Error', {})
        print(f"[WARN] Custom publish failed – Code={err.get('Code')}, Message={err.get('message') or err.get('Message')}")
    except Exception as e:
        print(f"[WARN] Custom publish unexpected error: {e}")

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

def _send_ack(gateway_id, device_id, seq):
    ack_ts = int(time.time())
    topic  = f"battery-monitor/{gateway_id}/down/ack"
    payload = {
        'destination'    : 'gateway',
        'gateway_id'     : gateway_id,
        'device_id'      : device_id,
        'sequence_number': seq,
        'timestamp'      : ack_ts,
        'status'         : 'ack'
    }
    try:
        iot.publish(topic=topic, qos=0, payload=json.dumps(payload))
        print(f"[ACK] Published: {payload}")
    except ClientError as exc:
        print(f"[ERROR] publish ACK failed: {exc.response['Error']['Message']}")

def _resp(code, body):
    return {
        'statusCode': code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False)
    }
