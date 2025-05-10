import os
import json
import boto3
from boto3.dynamodb.conditions import Key

# ���ϐ� TABLE_NAME �Ƀe�[�u�������Z�b�g
TABLE_NAME = os.environ.get('TABLE_NAME', 'MessageBuffer')
dynamodb  = boto3.resource('dynamodb')
table      = dynamodb.Table(TABLE_NAME)

def lambda_handler(event, context):
    try:
        # 1. �p�����[�^�擾
        params     = event.get('queryStringParameters') or {}
        device_id  = params.get('device_id')
        start_seq  = int(params.get('start',  0))
        end_seq    = int(params.get('end',    0))

        # 3. �Y���A�C�e�����y�[�W�l�[�V�������擾���폜
        deleted = 0
        last_key = None
        while True:
            q_kwargs = {
                'KeyConditionExpression': Key('device_id').eq(device_id) & 
                                         Key('sequence_number').between(start_seq, end_seq)
            }
            if last_key:
                q_kwargs['ExclusiveStartKey'] = last_key

            resp     = table.query(**q_kwargs)
            items    = resp.get('Items', [])
            last_key = resp.get('LastEvaluatedKey')

            # �o�b�`�폜
            with table.batch_writer() as batch:
                for it in items:
                    batch.delete_item(
                        Key={
                            'device_id':        it['device_id'],
                            'sequence_number':  it['sequence_number']
                        }
                    )
                    deleted += 1

            if not last_key:
                break

        # 4. ���X�|���X
        return {
            'statusCode': 200,
            'body': json.dumps({'deleted': deleted})
        }

    except Exception as e:
        # ���O�ɂ��o���Ă���
        print(e)
        return {
            'statusCode': 500,
            'body': str(e)
        }
