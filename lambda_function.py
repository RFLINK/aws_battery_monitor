import json
import boto3
from botocore.exceptions import ClientError

# クライアント初期化
iot_client = boto3.client('iot-data', region_name='ap-northeast-1')
dynamodb = boto3.resource('dynamodb', region_name='ap-northeast-1')
table = dynamodb.Table('MessageBuffer')  # テーブル名は必要に応じて変更

def lambda_handler(event, context):
    print("Received event:", json.dumps(event))

    try:
        # 必須パラメータ取得
        gateway_id = event['gateway_id']
        sequence_number = str(event['sequence_number'])
        device_id = event['device_id']
        rssi = event['rssi']
        timestamp = event['timestamp']

        # 拡張パラメータ（センサーデータ）
        voltages = event.get('voltages', [])  # 例：60個の電圧値
        temperature = event.get('temperature')
        humidity = event.get('humidity')

        gw_seq_key = f"{gateway_id}_{sequence_number}"

        # 既存レコード確認
        response = table.get_item(Key={'gw_seq_key': gw_seq_key})
        item = response.get('Item')

        if item is None:
            # 初回 → 保存 + ACK送信
            table.put_item(Item={
                'gw_seq_key': gw_seq_key,
                'device_id': device_id,
                'gateway_id': gateway_id,
                'rssi': rssi,
                'timestamp': timestamp,
                'voltages': voltages,
                'temperature': temperature,
                'humidity': humidity
            })
            send_ack(device_id, gateway_id, timestamp)
            print(f"New entry stored and ACK sent: {gw_seq_key}")
        else:
            # 2回目以降 → RSSIが強ければ上書き
            if rssi > item.get('rssi', -999):
                table.put_item(Item={
                    'gw_seq_key': gw_seq_key,
                    'device_id': device_id,
                    'gateway_id': gateway_id,
                    'rssi': rssi,
                    'timestamp': timestamp,
                    'voltages': voltages,
                    'temperature': temperature,
                    'humidity': humidity
                })
                print(f"Updated entry with stronger RSSI: {gw_seq_key}")
            else:
                print(f"Existing entry has stronger or equal RSSI. No update: {gw_seq_key}")

    except KeyError as e:
        print(f"Missing key in event: {e}")
    except ClientError as e:
        print(f"DynamoDB error: {e.response['Error']['Message']}")
    except Exception as e:
        print(f"Unhandled error: {str(e)}")

def send_ack(device_id, gateway_id, timestamp):
    ack_topic = f"gw/ack/{gateway_id}"
    ack_payload = {
        'device_id': device_id,
        'gateway_id': gateway_id,
        'status': 'ack',
        'timestamp': timestamp
    }

    try:
        iot_client.publish(
            topic=ack_topic,
            qos=1,
            payload=json.dumps(ack_payload)
        )
        print(f"Published ACK to {ack_topic}: {ack_payload}")
    except ClientError as e:
        print(f"Error publishing ACK: {e.response['Error']['Message']}")
