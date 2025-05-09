# ListDevices.py
import json
import boto3

dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table('MessageBuffer')

def lambda_handler(event, context):
    # Scan をページネーション対応で全件取得
    items = []
    resp = table.scan(ProjectionExpression='device_id')
    items.extend(resp.get('Items', []))

    # LastEvaluatedKey がある限り続ける
    while 'LastEvaluatedKey' in resp:
        resp = table.scan(
            ProjectionExpression='device_id',
            ExclusiveStartKey=resp['LastEvaluatedKey']
        )
        items.extend(resp.get('Items', []))

    # 重複排除＆ソート
    ids = sorted({ item['device_id'] for item in items })

    return {
        'statusCode': 200,
        'headers': {'Content-Type':'application/json'},
        'body': json.dumps(ids)
    }
