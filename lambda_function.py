import json
import boto3
import time
from botocore.exceptions import ClientError
from decimal import Decimal

# --- Environment Variables / Constants ---
IOT_REGION = 'ap-northeast-1'
TABLE_NAME = 'MessageBuffer'
REQUIRED_KEYS = ("destination", "gateway_id", "device_id", "sequence_number", "timestamp")

# --- AWS Clients Initialization ---
iot = boto3.client('iot-data', region_name=IOT_REGION)
ddb = boto3.resource('dynamodb', region_name=IOT_REGION)
table = ddb.Table(TABLE_NAME)


def lambda_handler(event, context):
    print("Received event:", event)

    # 1) Required field check
    for key in REQUIRED_KEYS:
        if key not in event:
            raise ValueError(f"Missing required field: {key}")

    # 2) Extract and convert parameters
    gateway_id      = event['gateway_id']
    seq = int(event['sequence_number'])
    device_id       = event['device_id']
    msg_ts          = int(event['timestamp'])
    rssi            = int(event.get('rssi')) if 'rssi' in event else None

    # Numeric fields conversion
    voltages = [Decimal(str(v)) for v in event.get('voltages', [])]
    temperature = Decimal(str(event['temperature'])) if 'temperature' in event else None
    humidity    = Decimal(str(event['humidity']))    if 'humidity' in event else None

    now       = int(time.time())
    threshold = now - 3

    # Handle ping: ACK only
    if event['destination'] == 'ping':
        seq = 0

    # Ignore non-server
    if event['destination'] not in ('server', 'ping'):
        return {'status': 'ignored_destination'}

    # 3) Initial write + ACK
    try:
        table.put_item(
            Item={
                'device_id'       : device_id,
                'sequence_number' : seq,
                'gateway_id'      : gateway_id,
                'timestamp'       : msg_ts,
                'rssi'            : rssi,
                'voltages'        : voltages,
                'temperature'     : temperature,
                'humidity'        : humidity,
                'db_update_time'  : now
            },
            ConditionExpression="attribute_not_exists(device_id) AND attribute_not_exists(sequence_number)"
        )
        _send_ack(gateway_id, device_id, seq)
        print(f"[Init] Stored & ACK for {device_id}_{seq}")
        return {'status': 'first_stored'}

    except ClientError as exc:
        code = exc.response['Error']['Code']
        if code != 'ConditionalCheckFailedException':
            print(f"[ERROR] put_item failed: {code}")
            raise

    # 4) Timeout-based update + ACK
    try:
        resp = table.update_item(
            Key={'device_id': device_id, 'sequence_number': seq},
            UpdateExpression="""
                SET gateway_id      = :gateway_id,
                    rssi            = :rssi,
                    voltages        = :voltages,
                    temperature     = :temperature,
                    humidity        = :humidity,
                    #ts             = :msg_ts,
                    db_update_time  = :now
            """,
            ExpressionAttributeNames={'#ts': 'timestamp'},
            ExpressionAttributeValues={
                ':gateway_id': gateway_id,
                ':rssi'      : rssi,
                ':voltages'  : voltages,
                ':temperature': temperature,
                ':humidity'  : humidity,
                ':msg_ts'    : msg_ts,
                ':now'       : now,
                ':threshold' : threshold
            },
            ConditionExpression="db_update_time < :threshold",
            ReturnValues="ALL_NEW"
        )
        _send_ack(gateway_id, device_id, seq)
        print(f"[Timeout Update] Overwrite {device_id}_{seq} after timeout")
        print("[New Item]", resp.get('Attributes'))
        return {'status': 'timeout_updated'}

    except ClientError as exc:
        code = exc.response['Error']['Code']
        if code == 'ConditionalCheckFailedException':
            print(f"[Skip] No update needed for {device_id}_{seq}")
            return {'status': 'no_update_needed'}
        print(f"[ERROR] update_item failed: {code}")
        raise


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
