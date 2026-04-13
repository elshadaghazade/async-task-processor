resource "aws_iam_role" "apigw_sfn" {
  name = "${local.prefix}-apigw-sfn-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "apigateway.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "apigw_sfn_start" {
  name = "start-executions"
  role = aws_iam_role.apigw_sfn.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "states:StartExecution"
      Resource = aws_sfn_state_machine.task_workflow.arn
    }]
  })
}

resource "aws_apigatewayv2_api" "tasks" {
  name          = "${local.prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["POST", "GET", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.tasks.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
    })
  }
}

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/apigateway/${local.prefix}-api"
  retention_in_days = 30
}

# POST /tasks
resource "aws_apigatewayv2_integration" "start_task" {
  api_id              = aws_apigatewayv2_api.tasks.id
  integration_type    = "AWS_PROXY"
  integration_subtype = "StepFunctions-StartExecution"
  credentials_arn     = aws_iam_role.apigw_sfn.arn

  request_parameters = {
    "StateMachineArn" = aws_sfn_state_machine.task_workflow.arn
    "Input"           = "$request.body"
    "Name"            = "create-task-$context.requestId"
  }

  payload_format_version = "1.0"
}

resource "aws_apigatewayv2_route" "post_tasks" {
  api_id    = aws_apigatewayv2_api.tasks.id
  route_key = "POST /tasks"
  target    = "integrations/${aws_apigatewayv2_integration.start_task.id}"
}

# GET /tasks/{task_id}
resource "aws_lambda_function" "get_task" {
  function_name    = "${local.prefix}-get-task"
  role             = aws_iam_role.get_task.arn
  runtime          = var.lambda_runtime
  handler          = "handler.handler"
  filename         = data.archive_file.get_task.output_path
  source_code_hash = data.archive_file.get_task.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      TASKS_TABLE    = aws_dynamodb_table.tasks.name,
      CONFIG_VERSION = "2"
    }
  }

  depends_on = [aws_cloudwatch_log_group.get_task]
}

resource "aws_cloudwatch_log_group" "get_task" {
  name              = "/aws/lambda/${local.prefix}-get-task"
  retention_in_days = 30
}

# GET /tasks
resource "aws_lambda_function" "list_tasks" {
  function_name    = "${local.prefix}-list-tasks"
  role             = aws_iam_role.list_tasks.arn
  runtime          = var.lambda_runtime
  handler          = "handler.handler"
  filename         = data.archive_file.list_tasks.output_path
  source_code_hash = data.archive_file.list_tasks.output_base64sha256
  timeout          = 10
  memory_size      = 128

  environment {
    variables = {
      TASKS_TABLE = aws_dynamodb_table.tasks.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.list_tasks]
}

resource "aws_cloudwatch_log_group" "list_tasks" {
  name              = "/aws/lambda/${local.prefix}-list-tasks"
  retention_in_days = 30
}

# Archives
data "archive_file" "get_task" {
  type        = "zip"
  source_dir  = "${path.module}/dist/get_task"
  output_path = "${path.module}/.build/get_task.zip"
}

data "archive_file" "list_tasks" {
  type        = "zip"
  source_dir  = "${path.module}/dist/list_tasks"
  output_path = "${path.module}/.build/list_tasks.zip"
}


# get_task roles
resource "aws_iam_role" "get_task" {
  name               = "${local.prefix}-get-task-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "get_task_logs" {
  role       = aws_iam_role.get_task.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "get_task_dynamo" {
  name = "dynamo-read"
  role = aws_iam_role.get_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem"]
      Resource = [aws_dynamodb_table.tasks.arn]
    }]
  })
}

resource "aws_apigatewayv2_integration" "get_task" {
  api_id                 = aws_apigatewayv2_api.tasks.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.get_task.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_task" {
  api_id    = aws_apigatewayv2_api.tasks.id
  route_key = "GET /tasks/{task_id}"
  target    = "integrations/${aws_apigatewayv2_integration.get_task.id}"
}

resource "aws_lambda_permission" "apigw_get_task" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_task.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.tasks.execution_arn}/*/*"
}

# list_tasks roles
resource "aws_iam_role" "list_tasks" {
  name               = "${local.prefix}-list-tasks-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "list_tasks_logs" {
  role       = aws_iam_role.list_tasks.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "list_tasks_dynamo" {
  name = "dynamo-query"
  role = aws_iam_role.list_tasks.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "dynamodb:Query",
        "dynamodb:Scan"
      ]
      Resource = [
        aws_dynamodb_table.tasks.arn,
        "${aws_dynamodb_table.tasks.arn}/index/status-created-index"
      ]
    }]
  })
}

resource "aws_apigatewayv2_integration" "list_tasks" {
  api_id                 = aws_apigatewayv2_api.tasks.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.list_tasks.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "list_tasks" {
  api_id    = aws_apigatewayv2_api.tasks.id
  route_key = "GET /tasks"
  target    = "integrations/${aws_apigatewayv2_integration.list_tasks.id}"
}

resource "aws_lambda_permission" "apigw_list_tasks" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.list_tasks.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.tasks.execution_arn}/*/*"
}