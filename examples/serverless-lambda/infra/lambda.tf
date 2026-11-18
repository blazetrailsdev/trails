locals {
  sqlite_env = {
    TRAILS_ENV    = "production"
    SQLITE_PATH   = "/tmp/spike.sqlite3"
    SPIKE_DB_SEED = "db/spike.sqlite3"
  }
  postgres_env = var.postgres ? {
    TRAILS_ENV = "production"
    PGHOST     = aws_db_instance.pg[0].address
    PGUSER     = aws_db_instance.pg[0].username
    PGPASSWORD = random_password.db[0].result
    PGDATABASE = aws_db_instance.pg[0].db_name
  } : null
  zip = "${path.module}/../build/lambda.zip"
}

resource "aws_lambda_function" "app" {
  function_name    = var.name
  role             = local.role_arn
  runtime          = "nodejs26.x"
  architectures    = ["arm64"]
  handler          = "handler.handler"
  memory_size      = var.memory_size
  timeout          = 15
  filename         = local.zip
  source_code_hash = filebase64sha256(local.zip)

  environment {
    variables = var.postgres ? local.postgres_env : local.sqlite_env
  }

  dynamic "vpc_config" {
    for_each = var.postgres ? [1] : []
    content {
      subnet_ids         = data.aws_subnets.default[0].ids
      security_group_ids = [aws_security_group.function[0].id]
    }
  }

  depends_on = [aws_iam_role_policy_attachment.basic, aws_iam_role_policy_attachment.vpc]
}

resource "aws_lambda_function_url" "app" {
  function_name      = aws_lambda_function.app.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "url" {
  statement_id           = "public-url"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.app.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "invoke" {
  statement_id  = "public-url-invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.app.function_name
  principal     = "*"
}

resource "aws_lambda_invocation" "seed" {
  count         = var.postgres ? 1 : 0
  function_name = aws_lambda_function.app.function_name
  input         = jsonencode({ seed = true })
  triggers      = { db = aws_db_instance.pg[0].id }
}
