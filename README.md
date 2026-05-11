# RAG Document Assistant

A Retrieval-Augmented Generation (RAG) document Q&A application. Upload any PDF and ask questions about it in plain English. Documents are extracted, split into chunks, embedded using OpenAI's text-embedding-3-small model, and stored in DynamoDB. At query time, the question is embedded and compared against all stored chunks using cosine similarity to find the most relevant passages, which are then sent to GPT-4o-mini as context for generating an accurate, grounded answer. The React frontend provides a clean chat interface with multi-document support, persistent chat history per document, and source citations showing which chunks were used and their similarity scores.

> **Note on AWS Bedrock:** This project was originally designed to use **AWS Bedrock with Claude 3 Haiku** for LLM inference and **Amazon Titan Embeddings** for vector generation — the ideal architecture for a fully AWS-native RAG pipeline. However, AWS Bedrock access for Anthropic models requires account verification that can take weeks for new accounts. While awaiting approval, OpenAI's API was used as a direct substitute. The architecture is otherwise identical — the Bedrock version would replace the OpenAI client calls in `chat_api.py` and `document_processor.py` with `boto3.client('bedrock-runtime')` calls, keeping all other infrastructure (S3, Lambda, DynamoDB, API Gateway, CloudFront) unchanged.

---

## Live Demo

**[Open RAG Document Assistant →](http://rag-document-assistant-frontend-8eed2efc.s3-website-us-east-1.amazonaws.com/)**

Upload a PDF → wait 30 seconds for processing → ask anything about the document.

---

## What It Does

- **PDF upload** — drag and drop a PDF, uploaded directly to S3 via presigned URL
- **Automatic processing** — S3 event triggers Lambda which extracts text, chunks it into 500-word segments, generates embeddings, and stores everything in DynamoDB
- **Semantic search** — questions are embedded and compared against all document chunks using cosine similarity to find the most relevant passages
- **Grounded answers** — top matching chunks are sent to GPT-4o-mini as context, producing accurate answers with source citations
- **Multi-document support** — upload multiple PDFs and switch between them in the chat interface
- **Chat history** — conversation history is preserved per document when switching between chats
- **Source citations** — every answer shows which chunks were retrieved and their similarity match scores

---

## Architecture

```
                    ┌─────────────────────────────────────────────────────┐
                    │                      AWS                            │
                    │                                                     │
  Browser ─────────► S3 Static Website (React + Vite)                    │
                    │         │                                           │
                    │         │ API calls (documents, chat)               │
                    │         ▼                                           │
                    │  API Gateway (REST)                                 │
                    │         │                                           │
                    │         ▼                                           │
                    │  Lambda — document_api                              │
                    │  ├── GET /documents (list all docs)                 │
                    │  ├── POST /documents/upload-url (presigned URL)     │
                    │  ├── DELETE /documents/{id}                         │
                    │  └── Forwards /chat/* to chat_api Lambda            │
                    │         │                                           │
                    │         ▼                                           │
                    │  Lambda — chat_api                                  │
                    │  ├── Embeds question (text-embedding-3-small)       │
                    │  ├── Cosine similarity search against DynamoDB      │
                    │  ├── Sends top-K chunks to GPT-4o-mini             │
                    │  └── Stores chat history in DynamoDB               │
                    │                                                     │
                    │  DynamoDB (rag-document-assistant-data)             │
                    │  DOC#{id} METADATA — filename, chunk count          │
                    │  DOC#{id} CHUNK#{n} — content + embedding vector    │
                    │  CHAT#{session} MSG#{ts} — chat history             │
                    │                                                     │
  PDF Upload ───────► S3 Documents Bucket (presigned PUT)                │
                    │         │                                           │
                    │         │ S3 ObjectCreated event                    │
                    │         ▼                                           │
                    │  Lambda — document_processor                        │
                    │  ├── Extracts text (pypdf)                         │
                    │  ├── Chunks into 500-word segments                  │
                    │  ├── Generates embeddings (text-embedding-3-small)  │
                    │  └── Stores chunks + embeddings in DynamoDB         │
                    │                                                     │
                    │  Lambda Layer — openai + pypdf                      │
                    │  Terraform State → S3 Backend                       │
                    │  CloudWatch Alarm → chat API error rate             │
                    └─────────────────────────────────────────────────────┘

GitHub push → GitHub Actions CI/CD → Terraform backend + React frontend deploy
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Query, React Dropzone |
| LLM | OpenAI GPT-4o-mini (designed for AWS Bedrock Claude 3 Haiku) |
| Embeddings | OpenAI text-embedding-3-small (designed for Amazon Titan Embeddings) |
| Vector Search | Cosine similarity in Python (no external vector DB required) |
| Document Storage | AWS S3 (presigned upload URLs) |
| Vector Storage | AWS DynamoDB (PAY_PER_REQUEST) |
| Compute | AWS Lambda (Python 3.11) with OpenAI + pypdf layer |
| API | AWS API Gateway (REST) |
| Hosting | AWS S3 (static website) |
| Observability | AWS CloudWatch Alarms |
| Infrastructure as Code | Terraform (S3 remote state) |
| CI/CD | GitHub Actions |

---

## Project Structure

```
rag-document-assistant/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD — Terraform backend + React frontend
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Chat.jsx            # Chat interface with doc selector + history
│   │   │   ├── Documents.jsx       # Document library with delete and navigate
│   │   │   └── Upload.jsx          # Drag-and-drop PDF upload with progress
│   │   ├── components/
│   │   │   └── MessageBubble.jsx   # Chat bubble with source citations
│   │   ├── App.jsx                 # Router + navbar
│   │   └── main.jsx                # React Query provider
│   └── .env.production             # VITE_API_URL injected by CI/CD
├── lambda/
│   ├── document_processor.py       # S3-triggered: extract, chunk, embed, store
│   ├── document_api.py             # REST handler: list, upload-url, delete, route chat
│   ├── chat_api.py                 # RAG: embed question, similarity search, GPT answer
│   └── openai_layer.zip            # Lambda layer: openai + pypdf packages
├── terraform/
│   ├── main.tf                     # All AWS resources + S3 remote backend
│   ├── variables.tf                # Region, project name, OpenAI key (sensitive)
│   └── outputs.tf                  # API URL, frontend URL, bucket names
├── .gitignore
└── README.md
```

---

## RAG Pipeline Explained

```
1. INDEXING (happens on upload)
   PDF → pypdf text extraction → 500-word chunks with 50-word overlap
   → text-embedding-3-small → 1536-dim vectors → DynamoDB

2. RETRIEVAL (happens on each question)
   Question → text-embedding-3-small → 1536-dim vector
   → cosine similarity against all stored chunk vectors
   → top-5 most relevant chunks selected

3. GENERATION (happens after retrieval)
   Question + top-5 chunks → GPT-4o-mini system prompt
   → grounded answer that only uses document context
   → response with source citations and similarity scores
```

---

## Bedrock Migration Path

This project was built with OpenAI as a substitute for AWS Bedrock due to account access restrictions. The migration to full AWS-native implementation requires only two changes:

**Replace embeddings** in `document_processor.py` and `chat_api.py`:
```python
# Current (OpenAI)
client.embeddings.create(model="text-embedding-3-small", input=text)

# Bedrock equivalent
bedrock.invoke_model(
    modelId="amazon.titan-embed-text-v1",
    body=json.dumps({"inputText": text})
)
```

**Replace LLM** in `chat_api.py`:
```python
# Current (OpenAI)
client.chat.completions.create(model="gpt-4o-mini", messages=[...])

# Bedrock equivalent
bedrock.converse(
    modelId="anthropic.claude-3-haiku-20240307-v1:0",
    messages=[...]
)
```

All other infrastructure — S3, Lambda, DynamoDB, API Gateway, CloudFront, Terraform, CI/CD — remains identical.

---

## API Reference

### POST /documents/upload-url
Returns a presigned S3 URL for direct PDF upload.
```json
{"filename": "document.pdf"}
```

### GET /documents
Returns all processed documents with chunk counts and status.

### DELETE /documents/{doc_id}
Deletes document metadata and all chunks from DynamoDB.

### POST /chat
Runs the full RAG pipeline — embeds question, retrieves chunks, generates answer.
```json
{
  "question": "What is the candidate's work experience?",
  "doc_id": "documents_resume_pdf",
  "session_id": "abc12345"
}
```
Returns answer, session_id, and source citations with similarity scores.

### GET /chat/history?session_id=abc12345
Returns full conversation history for a session.

---

## How to Deploy

### Prerequisites
- AWS account with CLI configured
- Terraform installed
- Node.js 20+ installed
- OpenAI API key with credits

### Steps

**1. Create Terraform state bucket**
```bash
aws s3 mb s3://rag-tfstate-YOUR_NAME --region us-east-1
```

**2. Update bucket name in terraform/main.tf**

**3. Build the Lambda layer**
```bash
mkdir lambda_layer_build/python
pip install openai pypdf -t lambda_layer_build/python/ \
  --platform manylinux2014_x86_64 \
  --python-version 3.11 \
  --only-binary=:all: \
  --implementation cp
Compress-Archive -Path lambda_layer_build/python -DestinationPath lambda/openai_layer.zip
```

**4. Create terraform/terraform.tfvars (gitignored)**
```hcl
openai_api_key = "sk-your-key-here"
```

**5. Create GitHub repo and add secrets**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `OPENAI_API_KEY`

**6. Initialize Terraform**
```bash
cd terraform && terraform init && cd ..
```

**7. Push — CI/CD handles the rest**
```bash
git add . && git commit -m "Initial commit" && git push origin master
```

**8. Get your live URL**
```bash
cd terraform && terraform output frontend_url
```

---

## Screenshots

**Chat — Q&A with source citations:**

<img width="1059" height="642" alt="Capture" src="https://github.com/user-attachments/assets/31a815c4-4b4b-4e52-934a-634a99a83fa2" />

<img width="653" height="549" alt="Capture1" src="https://github.com/user-attachments/assets/14588df4-1413-4ccb-9bda-986e7e0df873" />

**Upload — drag and drop PDF with processing status:**

<img width="1054" height="576" alt="Capture2" src="https://github.com/user-attachments/assets/ba9284e6-cfc1-4d4d-967d-f6034fa4be6b" />

**Documents — library with chunk counts:**

<img width="1050" height="365" alt="Capture3" src="https://github.com/user-attachments/assets/0625c5ba-575f-4991-bc84-f1222b544a71" />


---

## Key Concepts Demonstrated

- **RAG architecture** — retrieval-augmented generation pipeline with chunking, embedding, cosine similarity search, and grounded LLM generation
- **Event-driven processing** — S3 ObjectCreated event automatically triggers document processing Lambda without any polling or scheduling
- **Presigned URLs** — documents upload directly from browser to S3 bypassing the API layer, reducing Lambda cost and latency
- **Cosine similarity** — vector similarity search implemented in pure Python without an external vector database
- **Lambda layers** — shared dependencies (openai, pypdf) packaged as a reusable layer across multiple Lambda functions
- **CI/CD pipeline** — two-job GitHub Actions workflow with Terraform backend outputs feeding into React build environment variables
- **CORS** — API Lambda returns correct preflight headers enabling browser-to-API calls across origins
- **Chat history** — per-document conversation history stored in DynamoDB and preserved client-side when switching between documents
- **Infrastructure as code** — all AWS resources provisioned via Terraform with S3 remote state
