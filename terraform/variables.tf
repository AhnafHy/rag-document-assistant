variable "aws_region" {
  default = "us-east-1"
}

variable "project_name" {
  default = "rag-document-assistant"
}

variable "openai_api_key" {
  description = "OpenAI API key"
  sensitive   = true
  default     = ""
}