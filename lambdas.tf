data "archive_file" "validate_task" {
  type        = "zip"
  source_dir  = "${path.module}/dist/validate_task"
  output_path = "${path.module}/.build/validate_task.zip"
}

data "archive_file" "process_task" {
  type        = "zip"
  source_dir  = "${path.module}/dist/process_task"
  output_path = "${path.module}/.build/process_task.zip"
}

data "archive_file" "fail_task" {
  type        = "zip"
  source_dir  = "${path.module}/dist/fail_task"
  output_path = "${path.module}/.build/fail_task.zip"
}


resource "aws_cloudwatch_log_group" "validate_task" {
  name              = "/aws/lambda/${local.prefix}-validate-task"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "process_task" {
  name              = "/aws/lambda/${local.prefix}-process-task"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "complete_task" {
  name              = "/aws/lambda/${local.prefix}-complete-task"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "fail_task" {
  name              = "/aws/lambda/${local.prefix}-fail-task"
  retention_in_days = 30
}

# lambda functions
resource "aws_lambda_function" "validate_task" {
  function_name    = "${local.prefix}-validate-task"
  role             = aws_iam_role.validate_task.arn
  runtime          = var.lambda_runtime
  handler          = "handler.handler"
  filename         = data.archive_file.validate_task.output_path
  source_code_hash = data.archive_file.validate_task.output_base64sha256
  timeout          = var.lambda_timeout
  memory_size      = 128

  environment {
    variables = {
      TASKS_TABLE = aws_dynamodb_table.tasks.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.validate_task]
}

resource "aws_lambda_function" "process_task" {
  function_name    = "${local.prefix}-process-task"
  role             = aws_iam_role.process_task.arn
  runtime          = var.lambda_runtime
  handler          = "handler.handler"
  filename         = data.archive_file.process_task.output_path
  source_code_hash = data.archive_file.process_task.output_base64sha256
  timeout          = var.lambda_timeout
  memory_size      = 128

  environment {
    variables = {
      TASKS_TABLE = aws_dynamodb_table.tasks.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.process_task]
}

resource "aws_lambda_function" "fail_task" {
  function_name    = "${local.prefix}-fail-task"
  role             = aws_iam_role.fail_task.arn
  runtime          = var.lambda_runtime
  handler          = "handler.handler"
  filename         = data.archive_file.fail_task.output_path
  source_code_hash = data.archive_file.fail_task.output_base64sha256
  timeout          = var.lambda_timeout
  memory_size      = 128

  environment {
    variables = {
      TASKS_TABLE = aws_dynamodb_table.tasks.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.fail_task]
}