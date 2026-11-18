output "url" {
  value = aws_lambda_function_url.app.function_url
}

output "seed_result" {
  value = var.postgres ? aws_lambda_invocation.seed[0].result : null
}
