# ListDevices.py
import json
import boto3

dynamodb = boto3.resource('dynamodb')
table    = dynamodb.Table('MessageBuffer')

def lambda_handler(event, context):
    # Scan ���y�[�W�l�[�V�����Ή��őS���擾
    items = []
    resp = table.scan(ProjectionExpression='device_id')
    items.extend(resp.get('Items', []))

    # LastEvaluatedKey ��������葱����
    while 'LastEvaluatedKey' in resp:
        resp = table.scan(
            ProjectionExpression='device_id',
            ExclusiveStartKey=resp['LastEvaluatedKey']
        )
        items.extend(resp.get('Items', []))

    # �d���r�����\�[�g
    ids = sorted({ item['device_id'] for item in items })

    return {
        'statusCode': 200,
        'headers': {'Content-Type':'application/json'},
        'body': json.dumps(ids)
    }
