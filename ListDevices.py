# ListDevices.py
import json
import boto3

dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table('MessageBuffer')

def lambda_handler(event, context):
    # 全アイテムから device_id だけを投影
    resp = table.scan(ProjectionExpression='device_id')
    # 重複を排除
    ids = sorted({ item['device_id'] for item in resp.get('Items', []) })
    return {
        'statusCode': 200,
        'headers': {'Content-Type':'application/json'},
        'body': json.dumps(ids)
    }

