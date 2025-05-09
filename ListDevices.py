# ListDevices.py
import json
import boto3

dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table('MessageBuffer')

def lambda_handler(event, context):
    # �S�A�C�e������ device_id �����𓊉e
    resp = table.scan(ProjectionExpression='device_id')
    # �d����r��
    ids = sorted({ item['device_id'] for item in resp.get('Items', []) })
    return {
        'statusCode': 200,
        'headers': {'Content-Type':'application/json'},
        'body': json.dumps(ids)
    }

