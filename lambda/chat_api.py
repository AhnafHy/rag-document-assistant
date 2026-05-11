import boto3
import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from boto3.dynamodb.conditions import Key, Attr
from openai import OpenAI

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('DYNAMODB_TABLE', 'rag-documents')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
TOP_K = 5

client = OpenAI(api_key=OPENAI_API_KEY)

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
            'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
        },
        'body': json.dumps(body, cls=DecimalEncoder)
    }

def cosine_similarity(vec1, vec2):
    v1 = [float(x) for x in vec1]
    v2 = [float(x) for x in vec2]
    dot = sum(a * b for a, b in zip(v1, v2))
    mag1 = sum(a * a for a in v1) ** 0.5
    mag2 = sum(b * b for b in v2) ** 0.5
    if mag1 == 0 or mag2 == 0:
        return 0
    return dot / (mag1 * mag2)

def get_relevant_chunks(table, doc_id, query_embedding, top_k=TOP_K):
    result = table.query(
        KeyConditionExpression=Key('pk').eq(f"DOC#{doc_id}") &
        Key('sk').begins_with('CHUNK#')
    )
    
    chunks = result.get('Items', [])
    if not chunks:
        return []
    
    scored = []
    for chunk in chunks:
        embedding = chunk.get('embedding', [])
        if embedding:
            score = cosine_similarity(query_embedding, embedding)
            scored.append({
                'content': chunk['content'],
                'score': score,
                'chunk_index': chunk['chunk_index']
            })
    
    scored.sort(key=lambda x: x['score'], reverse=True)
    return scored[:top_k]

def generate_answer(question, context_chunks, doc_name):
    context = '\n\n'.join([f"[Chunk {i+1}]: {c['content']}"
                           for i, c in enumerate(context_chunks)])
    
    system_prompt = """You are a helpful document assistant. Answer questions based strictly on the provided document context. If the answer is not in the context, say so clearly. Be concise and accurate."""
    
    user_prompt = f"""Document: {doc_name}

Context from document:
{context}

Question: {question}

Answer based on the document context above:"""
    
    completion = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        max_tokens=500,
        temperature=0.1
    )
    
    return completion.choices[0].message.content

def store_chat_message(table, session_id, role, content, doc_id=None):
    message_id = str(uuid.uuid4())[:8]
    table.put_item(Item={
        'pk': f"CHAT#{session_id}",
        'sk': f"MSG#{datetime.now(timezone.utc).isoformat()}#{message_id}",
        'session_id': session_id,
        'role': role,
        'content': content,
        'doc_id': doc_id or '',
        'created_at': datetime.now(timezone.utc).isoformat()
    })

def get_chat_history(table, session_id):
    result = table.query(
        KeyConditionExpression=Key('pk').eq(f"CHAT#{session_id}")
    )
    messages = sorted(result.get('Items', []),
                      key=lambda x: x['sk'])
    return [{
        'role': m['role'],
        'content': m['content'],
        'created_at': m['created_at']
    } for m in messages]

def lambda_handler(event, context):
    if event.get('httpMethod') == 'OPTIONS':
        return response(200, {})
    
    table = dynamodb.Table(TABLE_NAME)
    path = event.get('path', '/')
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    
    if method == 'POST' and path == '/chat':
        body = json.loads(event.get('body', '{}'))
        question = body.get('question', '')
        doc_id = body.get('doc_id', '')
        session_id = body.get('session_id', str(uuid.uuid4())[:8])
        
        if not question or not doc_id:
            return response(400, {'error': 'question and doc_id are required'})
        
        # Get document metadata
        doc_meta = table.get_item(
            Key={'pk': f"DOC#{doc_id}", 'sk': 'METADATA'}
        ).get('Item', {})
        doc_name = doc_meta.get('filename', 'Unknown document')
        
        # Generate question embedding
        q_embedding = client.embeddings.create(
            model="text-embedding-3-small",
            input=question
        ).data[0].embedding
        
        # Get relevant chunks
        relevant_chunks = get_relevant_chunks(table, doc_id, q_embedding)
        
        if not relevant_chunks:
            return response(200, {
                'answer': 'No relevant content found in the document for your question.',
                'session_id': session_id,
                'sources': []
            })
        
        # Store user message
        store_chat_message(table, session_id, 'user', question, doc_id)
        
        # Generate answer
        answer = generate_answer(question, relevant_chunks, doc_name)
        
        # Store assistant message
        store_chat_message(table, session_id, 'assistant', answer, doc_id)
        
        return response(200, {
            'answer': answer,
            'session_id': session_id,
            'sources': [{'content': c['content'][:200], 'score': round(c['score'], 3)}
                        for c in relevant_chunks]
        })
    
    elif method == 'GET' and path == '/chat/history':
        session_id = params.get('session_id', '')
        if not session_id:
            return response(400, {'error': 'session_id is required'})
        history = get_chat_history(table, session_id)
        return response(200, history)
    
    return response(404, {'error': 'Endpoint not found'})