output "api_url" {
  value       = aws_api_gateway_stage.prod.invoke_url
  description = "API Gateway base URL"
}

output "frontend_url" {
  value       = "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
  description = "S3 website URL"
}

output "frontend_bucket" {
  value       = aws_s3_bucket.frontend.id
  description = "S3 bucket for frontend deployment"
}

output "documents_bucket" {
  value       = aws_s3_bucket.documents.id
  description = "S3 bucket for uploaded documents"
}