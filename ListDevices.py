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
        'FilterExpression': Attr('sequence_number').gte(1)  # ここでシーケンス番号 ≥ 1 のものだけを通す
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

    # 重複排除＆ソート（Length→ASCII）
    ids = sorted(
        { str(item['device_id']) for item in items },   # device_id を文字列として扱う
        key=lambda s: (len(s), s)
    )

    return {
        'statusCode': 200,
        'headers': {'Content-Type':'application/json'},
        'body': json.dumps(ids)
    }
