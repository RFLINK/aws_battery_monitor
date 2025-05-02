import json
import boto3
from botocore.exceptions import ClientError
from decimal import Decimal  # 追加

# --- 環境変数 or 定数 ---
IOT_REGION = 'ap-northeast-1'
TABLE_NAME = 'MessageBuffer'
REQUIRED   = ("destination", "gateway_id", "device_id", "sequence_number", "timestamp")

# --- クライアント初期化 ---
iot_client = boto3.client('iot-data', region_name=IOT_REGION)
dynamodb   = boto3.resource('dynamodb', region_name=IOT_REGION)
table      = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    print("Received event:", event)

    # 必須チェック
    for field in REQUIRED:
        if field not in event:
            raise ValueError(f"Missing required field: {field}")

    # server 宛以外は無視
    if event["destination"] != "server":
        return {"status": "ignored_destination"}

    # パラメータ取得・Decimal 変換
    gateway_id      = event['gateway_id']
    sequence_number = str(event['sequence_number'])
    device_id       = event['device_id']
    timestamp       = int(event['timestamp'])
    rssi            = int(event.get("rssi")) if event.get("rssi") is not None else None

    # ここで float → Decimal へ変換
    voltages_decimal = [Decimal(str(v)) for v in event.get("voltages", [])]
    temperature_decimal = (Decimal(str(event["temperature"]))
                           if event.get("temperature") is not None else None)
    humidity_decimal    = (Decimal(str(event["humidity"]))
                           if event.get("humidity") is not None else None)

    gw_seq_key = f"{gateway_id}_{sequence_number}"

    # 初回書き込み + ACK
    try:
        table.put_item(
            Item={
                'gw_seq_key'     : gw_seq_key,
                'gateway_id'     : gateway_id,
                'device_id'      : device_id,
                'sequence_number': sequence_number,
                'timestamp'      : timestamp,
                'rssi'           : rssi,
                'voltages'       : voltages_decimal,
                'temperature'    : temperature_decimal,
                'humidity'       : humidity_decimal
            },
            ConditionExpression="attribute_not_exists(gw_seq_key)"
        )
        _send_ack(gateway_id, device_id, sequence_number, timestamp)
        print(f"[Init] Stored & ACK sent for {gw_seq_key}")
        return {"status": "first_stored"}

    except ClientError as e:
        code = e.response['Error']['Code']
        if code != 'ConditionalCheckFailedException':
            raise  # 予期しないエラーは投げ直す

    # RSSIが強ければ上書き
    try:
        table.update_item(
            Key={'gw_seq_key': gw_seq_key},
            UpdateExpression="""
                SET rssi        = :rssi,
                    voltages    = :voltages,
                    temperature = :temperature,
                    humidity    = :humidity,
                    timestamp   = :timestamp
            """,
            ConditionExpression="rssi < :rssi",
            ExpressionAttributeValues={
                ':rssi'        : rssi,
                ':voltages'    : voltages_decimal,
                ':temperature' : temperature_decimal,
                ':humidity'    : humidity_decimal,
                ':timestamp'   : timestamp
            }
        )
        print(f"[Update] Overwrote {gw_seq_key} with stronger RSSI {rssi}")
        return {"status": "updated_rssi"}

    except ClientError as e:
        if e.response['Error']['Code'] == "ConditionalCheckFailedException":
            print(f"[Skip] Existing RSSI is stronger or equal for {gw_seq_key}")
            return {"status": "no_update_needed"}
        else:
            raise

def _send_ack(gateway_id, device_id, sequence_number, timestamp):
    ack_topic = f"battery-monitor/{gateway_id}/down/ack"
    payload = {
        "destination"    : "gateway",
        "gateway_id"     : gateway_id,
        "device_id"      : device_id,
        "sequence_number": sequence_number,
        "timestamp"      : timestamp,
        "status"         : "ack"
    }
    try:
        iot_client.publish(topic=ack_topic, qos=1, payload=json.dumps(payload))
        print(f"ACK published to {ack_topic}: {payload}")
    except ClientError as e:
        print(f"Error publishing ACK: {e.response['Error']['Message']}")
