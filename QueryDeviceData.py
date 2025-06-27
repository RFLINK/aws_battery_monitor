import os
import json
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key
import datetime
import time
import logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# 環境変数にテーブル名を設定
TABLE_NAME = os.environ.get('TABLE_NAME', 'MessageBuffer')
IOT_REGION = 'ap-northeast-1'
iot = boto3.client('iot-data', region_name=IOT_REGION)
sns = boto3.client('sns')

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

    # 認証チェック
    VALID_ID = os.environ.get('VALID_ID', 'admin')
    VALID_PASS = os.environ.get('VALID_PASSWORD', 'password')

    user_id = params.get('id')
    password = params.get('password')

    if user_id != VALID_ID or password != VALID_PASS:
        print(f"[AUTH] Invalid credentials: id={user_id}, password={password}")
        return _resp(401, {'error': '認証失敗'})

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

    # ───────────────────────────────────────
    # 4.5) 電圧値サニタイズ：Web/CSV 出力用にのみ適用
    corrections = 0
    clean, corrections, seq_abnormal, abnormal_values = _sanitize_voltages(clean)
    if corrections > 0:
        try:
            print(f"[PREP] Voltages sanitized: {corrections} values > 110V replaced")

            jst = datetime.timezone(datetime.timedelta(hours=9))
            jst_str = "(不明)"
            if seq_abnormal is not None:
                jst_dt = datetime.datetime.fromtimestamp(seq_abnormal * 180, tz=jst)
                jst_str = jst_dt.strftime('%Y/%m/%d %H:%M:%S')
            abnormal_str = ', '.join(f"{v:.2f}" for v in abnormal_values[:10])
            if len(abnormal_values) > 10:
                abnormal_str += f"（他 {len(abnormal_values) - 10} 件）"

            message = (
                f"電圧異常値を検出しました。\n\n"
                f"デバイスID: {device_id}\n"
                f"異常検出シーケンス: {seq_abnormal}\n"
                f"JST時刻: {jst_str}\n"
                f"異常補正数: {corrections} 件\n"
                f"異常電圧値（最大10件表示）: {abnormal_str}"
            )

            response = sns.publish(
                TopicArn='arn:aws:sns:ap-northeast-1:354918407007:invalid_voltage_values',
                Subject=f'電圧異常通知 id: {device_id} 時刻: {jst_str}',
                Message=message
            )        
            logger.info(f"SNS MessageId: {response.get('MessageId')}")
            
        except Exception as e:
            logger.error("SNS publish failed", exc_info=True)
    # ───────────────────────────────────────

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
    _send_ack(device_id, seq=0)

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

def _send_ack(device_id, seq):
    import boto3
    lambda_client = boto3.client('lambda', region_name=IOT_REGION)    
    # 1) 最新レコードを降順クエリで取得
    try:
        resp = table.query(
            KeyConditionExpression=Key('device_id').eq(device_id),
            ScanIndexForward=False,  # 降順取得
            Limit=1
        )
        items = resp.get('Items', [])
        latest_gw = items[0].get('gateway_id') if items else None
    except Exception as e:
        print(f"[ERROR] 最新 gateway_id の取得に失敗: {e}")
        latest_gw = None

    # 2) ペイロード & トピック組み立て
    custom_payload = {
        'destination'    : 'gateway',
        'gateway_id'     : latest_gw,
        'device_id'      : device_id,
        'sequence_number': seq,
        'timestamp'      : int(time.time()),
        'status'         : 'ack'
    }
    topic = f"battery-monitor/{latest_gw}/down/ack"

    # 3) パブリッシュ
    try:
        iot.publish(topic=topic, qos=0, payload=json.dumps(custom_payload))
        print(f"[ACK] Published to {topic}: {custom_payload}")
    except Exception as e:
        print(f"[WARN] ACK publish failed: {e}")

def _resp(code, body):
    return {
        'statusCode': code,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(body, ensure_ascii=False)
    }

# 追加：サニタイズ関数
def _sanitize_voltages(items):
    total_corrections = 0
    latest_abnormal_seq = None
    abnormal_values = []

    for item in items:
        vs = item.get('voltages', [])
        seq = item.get('sequence_number', 0)

        first_valid = next((x for x in vs if isinstance(x, (int, float)) and x <= 110), 0)
        prev = first_valid

        for i, v in enumerate(vs):
            if isinstance(v, (int, float)) and v > 110:
                abnormal_values.append(v)
                vs[i] = prev
                total_corrections += 1
                latest_abnormal_seq = seq
            else:
                prev = v

    return items, total_corrections, latest_abnormal_seq, abnormal_values
