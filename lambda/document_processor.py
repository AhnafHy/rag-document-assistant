import boto3
import json
import os
import re
import urllib.parse
from datetime import datetime, timezone
from decimal import Decimal
from openai import OpenAI

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

TABLE_NAME = os.environ.get('DYNAMODB_TABLE', 'rag-documents')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50

client = OpenAI(api_key=OPENAI_API_KEY)

def extract_text_from_pdf(bucket, key):
    response = s3.get_object(Bucket=bucket, Key=key)
    content = response['Body'].read()
    
    # Extract text from PDF using basic parsing
    text = ''
    try:
        # Try to decode as text first
        text = content.decode('utf-8', errors='ignore')
        # Clean up PDF binary artifacts
        text = re.sub(r'[^\x20-\x7E\n\r\t]', ' ', text)
        text = re.sub(r'\s+', ' ', text).strip()
    except Exception as e:
        print(f"Text extraction error: {e}")
        text = f"Document content from {key}"
    
    return text

def chunk_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    words = text.split()
    chunks = []
    
    if not words:
        return chunks
    
    i = 0
    while i < len(words):
        chunk_words = words[i:i + chunk_size]
        chunk = ' '.join(chunk_words)
        if chunk.strip():
            chunks.append(chunk)
        i += chunk_size - overlap
    
    return chunks

def generate_embedding(text):
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=text[:8000]
    )
    return response.data[0].embedding

def cosine_similarity(vec1, vec2):
    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = sum(a * a for a in vec1) ** 0.5
    magnitude2 = sum(b * b for b in vec2) ** 0.5
    if magnitude1 == 0 or magnitude2 == 0:
        return 0
    return dot_product / (magnitude1 * magnitude2)

def store_document(table, doc_id, filename, chunks, embeddings, bucket, key):
    processed_at = datetime.now(timezone.utc).isoformat()
    
    # Store document metadata
    table.put_item(Item={
        'pk': f"DOC#{doc_id}",
        'sk': 'METADATA',
        'doc_id': doc_id,
        'filename': filename,
        'bucket': bucket,
        's3_key': key,
        'chunk_count': len(chunks),
        'processed_at': processed_at,
        'status': 'READY'
    })
    
    # Store chunks with embeddings
    with table.batch_writer() as batch:
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            batch.put_item(Item={
                'pk': f"DOC#{doc_id}",
                'sk': f"CHUNK#{i:04d}",
                'doc_id': doc_id,
                'chunk_index': i,
                'content': chunk,
                'embedding': [Decimal(str(round(v, 6))) for v in embedding],
                'processed_at': processed_at
            })
    
    print(f"Stored {len(chunks)} chunks for document {doc_id}")

def lambda_handler(event, context):
    table = dynamodb.Table(TABLE_NAME)
    
    for record in event['Records']:
        bucket = record['s3']['bucket']['name']
        key = urllib.parse.unquote_plus(record['s3']['object']['key'])
        
        print(f"Processing: s3://{bucket}/{key}")
        
        # Generate document ID from key
        doc_id = key.replace('/', '_').replace('.', '_').replace(' ', '_')
        filename = key.split('/')[-1]
        
        # Extract text
        text = extract_text_from_pdf(bucket, key)
        print(f"Extracted {len(text)} characters")
        
        # Chunk text
        chunks = chunk_text(text)
        print(f"Created {len(chunks)} chunks")
        
        if not chunks:
            print("No chunks generated — skipping")
            continue
        
        # Limit chunks for cost control
        chunks = chunks[:50]
        
        # Generate embeddings
        print("Generating embeddings...")
        embeddings = []
        for chunk in chunks:
            embedding = generate_embedding(chunk)
            embeddings.append(embedding)
        
        # Store everything
        store_document(table, doc_id, filename, chunks, embeddings, bucket, key)
        
        print(f"Successfully processed {filename}")
    
    return {'statusCode': 200, 'body': 'Processing complete'}