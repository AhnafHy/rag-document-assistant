import boto3
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

TABLE_NAME = os.environ.get('DYNAMODB_TABLE', 'rag-documents')
DOCUMENTS_BUCKET = os.environ.get('DOCUMENTS_BUCKET', '')

class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)

def response(status_code, body):
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS'
        },
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def get_documents(table):
    result = table.scan(
        FilterExpression=Attr('sk').eq('METADATA')
    )
    docs = sorted(result.get('Items', []),
                  key=lambda x: x['processed_at'], reverse=True)
    return [{
        'doc_id': d['doc_id'],
        'filename': d['filename'],
        'chunk_count': int(d['chunk_count']),
        'processed_at': d['processed_at'],
        'status': d['status']
    } for d in docs]

def get_upload_url(filename):
    key = f"documents/{filename}"
    url = s3.generate_presigned_url(
        'put_object',
        Params={
            'Bucket': DOCUMENTS_BUCKET,
            'Key': key,
            'ContentType': 'application/pdf'
        },
        ExpiresIn=300
    )
    return url, key

def delete_document(table, doc_id):
    result = table.query(
        KeyConditionExpression=Key('pk').eq(f"DOC#{doc_id}")
    )
    with table.batch_writer() as batch:
        for item in result.get('Items', []):
            batch.delete_item(Key={'pk': item['pk'], 'sk': item['sk']})
    return True

def lambda_handler(event, context):
    if event.get('httpMethod') == 'OPTIONS':
        return response(200, {})
    
    table = dynamodb.Table(TABLE_NAME)
    path = event.get('path', '/')
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    
    if method == 'GET' and path == '/health':
        return response(200, {'status': 'ok'})
    
    elif method == 'GET' and path == '/documents':
        return response(200, get_documents(table))
    
    elif method == 'POST' and path == '/documents/upload-url':
        body = json.loads(event.get('body', '{}'))
        filename = body.get('filename', '')
        if not filename:
            return response(400, {'error': 'filename is required'})
        url, key = get_upload_url(filename)
        return response(200, {'upload_url': url, 'key': key})
    
    elif method == 'DELETE' and '/documents/' in path:
        doc_id = path.split('/documents/')[-1]
        delete_document(table, doc_id)
        return response(200, {'message': 'Document deleted'})
    
    return response(404, {'error': 'Endpoint not found'})