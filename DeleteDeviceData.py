import os
import json
import boto3
from boto3.dynamodb.conditions import Key

# 環境変数でテーブル名を取得
TABLE_NAME = os.environ.get('TABLE_NAME', 'MessageBuffer')
dynamodb   = boto3.resource('dynamodb')
table      = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    try:
        params    = event.get('queryStringParameters') or {}
        device_id = params.get('device_id')
        if not device_id:
            return { 'statusCode': 400, 'body': json.dumps({'message':'device_id is required'}) }

        all_flag = params.get('all') == 'true'
        if all_flag:
            key_expr = Key('device_id').eq(device_id)
        else:
            start_seq = int(params.get('start', 0))
            end_seq   = int(params.get('end',   0))
            key_expr  = Key('device_id').eq(device_id) & Key('sequence_number').between(start_seq, end_seq)

        deleted  = 0
        last_key = None

        # ← ここで必ず key_expr を使う
        while True:
            query_kwargs = {'KeyConditionExpression': key_expr}
            if last_key:
                query_kwargs['ExclusiveStartKey'] = last_key

            resp     = table.query(**query_kwargs)
            items    = resp.get('Items', [])
            last_key = resp.get('LastEvaluatedKey')

            with table.batch_writer() as batch:
                for it in items:
                    batch.delete_item(Key={
                        'device_id':       it['device_id'],
                        'sequence_number': it['sequence_number']
                    })
                    deleted += 1

            if not last_key:
                break

        return { 'statusCode': 200, 'body': json.dumps({'deleted': deleted}) }

    except Exception as e:
        # 例外内容をログに出しておくと原因追跡が捗ります
        print("Error in deleteAllData:", e, type(e).__name__)
        return { 'statusCode': 500, 'body': json.dumps({'message': str(e)}) }
