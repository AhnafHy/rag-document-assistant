terraform {
  backend "s3" {
    bucket = "rag-tfstate-ahnaf"
    key    = "rag/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

resource "random_id" "suffix" {
  byte_length = 4
}

# ─── S3 FOR FRONTEND ────────────────────────────────────────
resource "aws_s3_bucket" "frontend" {
  bucket        = "${var.project_name}-frontend-${random_id.suffix.hex}"
  force_destroy = true
  tags = { Name = "${var.project_name}-frontend" }
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  index_document { suffix = "index.html" }
  error_document { key = "index.html" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# ─── S3 FOR DOCUMENTS ───────────────────────────────────────
resource "aws_s3_bucket" "documents" {
  bucket        = "${var.project_name}-docs-${random_id.suffix.hex}"
  force_destroy = true
  tags = { Name = "${var.project_name}-documents" }
}

resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = ["*"]
    max_age_seconds = 3000
  }
}

# ─── DYNAMODB ───────────────────────────────────────────────
resource "aws_dynamodb_table" "rag" {
  name         = "${var.project_name}-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  tags = { Name = "${var.project_name}-data" }
}

# ─── IAM ROLE FOR LAMBDA ────────────────────────────────────
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project_name}-policy"
  role = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query",
                    "dynamodb:Scan", "dynamodb:BatchWriteItem", "dynamodb:DeleteItem"]
        Resource = aws_dynamodb_table.rag.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.documents.arn, "${aws_s3_bucket.documents.arn}/*"]
      }
    ]
  })
}

# ─── LAMBDA LAYER FOR OPENAI ────────────────────────────────
resource "aws_lambda_layer_version" "openai_layer" {
  layer_name          = "${var.project_name}-openai"
  description         = "OpenAI Python SDK"
  compatible_runtimes = ["python3.11"]
  filename            = "${path.module}/../lambda/openai_layer.zip"
}

# ─── DOCUMENT PROCESSOR LAMBDA ──────────────────────────────
data "archive_file" "processor_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/document_processor.py"
  output_path = "${path.module}/../lambda/document_processor.zip"
}

resource "aws_lambda_function" "processor" {
  filename         = data.archive_file.processor_zip.output_path
  function_name    = "${var.project_name}-processor"
  role             = aws_iam_role.lambda_role.arn
  handler          = "document_processor.lambda_handler"
  runtime          = "python3.11"
  timeout          = 300
  memory_size      = 512
  source_code_hash = data.archive_file.processor_zip.output_base64sha256
  layers           = [aws_lambda_layer_version.openai_layer.arn]
  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.rag.name
      OPENAI_API_KEY = var.openai_api_key
    }
  }
  tags = { Name = "${var.project_name}-processor" }
}

resource "aws_lambda_permission" "s3_trigger" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.processor.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.documents.arn
}

resource "aws_s3_bucket_notification" "document_upload" {
  bucket = aws_s3_bucket.documents.id
  lambda_function {
    lambda_function_arn = aws_lambda_function.processor.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "documents/"
  }
  depends_on = [aws_lambda_permission.s3_trigger]
}

# ─── DOCUMENT API LAMBDA ────────────────────────────────────
data "archive_file" "doc_api_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/document_api.py"
  output_path = "${path.module}/../lambda/document_api.zip"
}

resource "aws_lambda_function" "doc_api" {
  filename         = data.archive_file.doc_api_zip.output_path
  function_name    = "${var.project_name}-doc-api"
  role             = aws_iam_role.lambda_role.arn
  handler          = "document_api.lambda_handler"
  runtime          = "python3.11"
  timeout          = 30
  source_code_hash = data.archive_file.doc_api_zip.output_base64sha256
  environment {
    variables = {
      DYNAMODB_TABLE   = aws_dynamodb_table.rag.name
      DOCUMENTS_BUCKET = aws_s3_bucket.documents.id
    }
  }
  tags = { Name = "${var.project_name}-doc-api" }
}

# ─── CHAT API LAMBDA ────────────────────────────────────────
data "archive_file" "chat_api_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/chat_api.py"
  output_path = "${path.module}/../lambda/chat_api.zip"
}

resource "aws_lambda_function" "chat_api" {
  filename         = data.archive_file.chat_api_zip.output_path
  function_name    = "${var.project_name}-chat-api"
  role             = aws_iam_role.lambda_role.arn
  handler          = "chat_api.lambda_handler"
  runtime          = "python3.11"
  timeout          = 60
  memory_size      = 256
  source_code_hash = data.archive_file.chat_api_zip.output_base64sha256
  layers           = [aws_lambda_layer_version.openai_layer.arn]
  environment {
    variables = {
      DYNAMODB_TABLE = aws_dynamodb_table.rag.name
      OPENAI_API_KEY = var.openai_api_key
    }
  }
  tags = { Name = "${var.project_name}-chat-api" }
}

# ─── API GATEWAY ────────────────────────────────────────────
resource "aws_api_gateway_rest_api" "api" {
  name = "${var.project_name}-api"
  binary_media_types = ["application/pdf", "multipart/form-data"]
}

resource "aws_api_gateway_resource" "proxy" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "{proxy+}"
}

resource "aws_api_gateway_method" "proxy" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.proxy.id
  http_method   = "ANY"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "doc_api" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.proxy.id
  http_method             = aws_api_gateway_method.proxy.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.doc_api.invoke_arn
}

resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.deployment.id
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = "prod"
}

resource "aws_api_gateway_deployment" "deployment" {
  depends_on  = [aws_api_gateway_integration.doc_api]
  rest_api_id = aws_api_gateway_rest_api.api.id
  lifecycle { create_before_destroy = true }
}

resource "aws_lambda_permission" "doc_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeDocApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.doc_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "chat_api_gateway" {
  statement_id  = "AllowAPIGatewayInvokeChatApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.chat_api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# ─── CLOUDWATCH ALARM ───────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "chat_errors" {
  alarm_name          = "${var.project_name}-chat-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Chat API Lambda error rate too high"
  dimensions = { FunctionName = aws_lambda_function.chat_api.function_name }
}