/*
{
  "destination": "server",
  "gateway_id": "gw-001",
  "device_id": "device-abc",
  "sequence_number": 12345,
  "timestamp": 1714128000,
  "rssi": -62,
  "voltages": [
    3.30, 3.28, 3.29, 3.30, 3.27, 3.31, 3.29, 3.30, 3.28, 3.30,
    3.29, 3.30, 3.28, 3.31, 3.29, 3.30, 3.27, 3.30, 3.29, 3.30,
    3.28, 3.31, 3.29, 3.30, 3.28, 3.30, 3.29, 3.31, 3.28, 3.30,
    3.29, 3.30, 3.28, 3.31, 3.27, 3.30, 3.29, 3.30, 3.28, 3.31,
    3.29, 3.30, 3.28, 3.30, 3.29, 3.31, 3.27, 3.30, 3.29, 3.30,
    3.28, 3.31, 3.29, 3.30, 3.28, 3.30, 3.29, 3.31, 3.28, 3.30
  ],
  "temperature": 24.8,
  "humidity": 58.2
}
*/

import json
import boto3
from botocore.exceptions import ClientError

# --- 環境変数 or 定数 ---
IOT_REGION   = 'ap-northeast-1'
TABLE_NAME   = 'MessageBuffer'
REQUIRED     = ("destination", "gateway_id", "device_id", "sequence_number", "timestamp")
for field in REQUIRED:
    if field not in event:
        raise ValueError(f"Missing required field: {field}")
      
# --- クライアント初期化 ---
iot_client = boto3.client('iot-data', region_name=IOT_REGION)
dynamodb   = boto3.resource('dynamodb', region_name=IOT_REGION)
table      = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    print("Received event:", event)
    # 1) 必須フィールドチェック
    for field in REQUIRED:
        if field not in event:
            raise ValueError(f"Missing required field: {field}")

    # 2) 宛先チェック（サーバー向けメッセージだけ処理）
    if event["destination"] != "server":
        print(f"Ignoring event for destination={event['destination']}")
        return {"status": "ignored_destination"}

    # 3) キー／パラメータ取得
    gateway_id      = event['gateway_id']
    sequence_number = str(event['sequence_number'])
    device_id       = event['device_id']
    timestamp       = event['timestamp']
    rssi            = event.get("rssi", None)
    voltages        = event.get("voltages", [])
    temperature     = event.get("temperature")
    humidity        = event.get("humidity")

    gw_seq_key = f"{gateway_id}_{sequence_number}"

    # 4) 初回書き込み → ACK
    try:
        table.put_item(
            Item={
                'gw_seq_key'     : gw_seq_key,
                'gateway_id'     : gateway_id,
                'device_id'      : device_id,
                'sequence_number': sequence_number,
                'timestamp'      : timestamp,
                'rssi'           : rssi,
                'voltages'       : voltages,
                'temperature'    : temperature,
                'humidity'       : humidity
            },
            ConditionExpression="attribute_not_exists(gw_seq_key)"
        )
        _send_ack(
            gateway_id=gateway_id,
            device_id=device_id,
            sequence_number=sequence_number,
            timestamp=timestamp
        )
        print(f"[Init] Stored & ACK sent for {gw_seq_key}")
        return {"status": "first_stored"}

    except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
        # 既存レコードあり → RSSI比較へ
        pass

    # 5) RSSI強ければ上書き
    try:
        table.update_item(
            Key={'gw_seq_key': gw_seq_key},
            UpdateExpression="""
                SET rssi           = :rssi,
                    gateway_id     = :gateway_id,
                    device_id      = :device_id,
                    sequence_number= :sequence_number,
                    timestamp      = :timestamp,
                    voltages       = :voltages,
                    temperature    = :temperature,
                    humidity       = :humidity
            """,
            ConditionExpression="rssi < :rssi",
            ExpressionAttributeValues={
                ':rssi'           : rssi,
                ':gateway_id'     : gateway_id,
                ':device_id'      : device_id,
                ':sequence_number': sequence_number,
                ':timestamp'      : timestamp,
                ':voltages'       : voltages,
                ':temperature'    : temperature,
                ':humidity'       : humidity,
            }
        )
        print(f"[Update] Overwrote {gw_seq_key} with stronger RSSI {rssi}")
        return {"status": "updated_rssi"}

    except ClientError as e:
        # RSSI が強くない場合は何もしない
        if e.response['Error']['Code']=="ConditionalCheckFailedException":
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
        print(f"ACK published to {topic}: {payload}")
    except ClientError as e:
        print(f"Error publishing ACK: {e.response['Error']['Message']}")
