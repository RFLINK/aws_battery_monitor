# ListDevices.py
import json
import boto3
from boto3.dynamodb.conditions import Attr

dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table('MessageBuffer')

def lambda_handler(event, context):
    # Scan のパラメータをまとめておく
    scan_params = {
        'ProjectionExpression': 'device_id',
        'FilterExpression': Attr('sequence_number').gte(1)  # ここでシーケンス番号 1 以上のものだけを通す
    }

    # Scan をページネーション対応で全件取得
    items = []
    resp = table.scan(**scan_params)
    items.extend(resp.get('Items', []))

    while 'LastEvaluatedKey' in resp:
        resp = table.scan(
            ExclusiveStartKey=resp['LastEvaluatedKey'],
            **scan_params
        )
        items.extend(resp.get('Items', []))

    # 重複排除＆ソート
    ids = sorted({ item['device_id'] for item in items })

    return {
        'statusCode': 200,
        'headers': {'Content-Type':'application/json'},
        'body': json.dumps(ids)
    }
