data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# Validate task roles
resource "aws_iam_role" "validate_task" {
  name               = "${local.prefix}-validate-task-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "validate_task_logs" {
  role       = aws_iam_role.validate_task.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "validate_task_dynamo" {
  name = "dynamo-write"
  role = aws_iam_role.validate_task.id

  policy = data.aws_iam_policy_document.validate_task_dynamo.json
}

data "aws_iam_policy_document" "validate_task_dynamo" {
  statement {
    sid    = "WriteTasks"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
    ]
    resources = [aws_dynamodb_table.tasks.arn]
  }
}

# process task roles
resource "aws_iam_role" "process_task" {
  name               = "${local.prefix}-process-task-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "process_task_logs" {
  role       = aws_iam_role.process_task.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "process_task_dynamo" {
  name = "dynamo-update"
  role = aws_iam_role.process_task.id

  policy = data.aws_iam_policy_document.process_task_dynamo.json
}

data "aws_iam_policy_document" "process_task_dynamo" {
  statement {
    sid    = "UpdateTasks"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
    ]
    resources = [aws_dynamodb_table.tasks.arn]
  }
}

# fail task roles
resource "aws_iam_role" "fail_task" {
  name               = "${local.prefix}-fail-task-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust.json
}

resource "aws_iam_role_policy_attachment" "fail_task_logs" {
  role       = aws_iam_role.fail_task.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "fail_task_dynamo" {
  name = "dynamo-update"
  role = aws_iam_role.fail_task.id

  policy = data.aws_iam_policy_document.fail_task_dynamo.json
}

data "aws_iam_policy_document" "fail_task_dynamo" {
  statement {
    sid    = "FailTasks"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
    ]
    resources = [aws_dynamodb_table.tasks.arn]
  }
}

# step functions execution role
resource "aws_iam_role" "sfn_exec" {
  name = "${local.prefix}-sfn-exec-role"

  assume_role_policy = data.aws_iam_policy_document.sfn_trust.json
}

data "aws_iam_policy_document" "sfn_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role_policy" "sfn_perms" {
  name = "invoke-lambdas-and-log"
  role = aws_iam_role.sfn_exec.id

  policy = data.aws_iam_policy_document.sfn_perms.json
}

data "aws_iam_policy_document" "sfn_perms" {
  statement {
    sid     = "InvokeLambdas"
    effect  = "Allow"
    actions = ["lambda:InvokeFunction"]
    resources = [
      aws_lambda_function.validate_task.arn,
      aws_lambda_function.process_task.arn,
      "${aws_lambda_function.validate_task.arn}:*",
      "${aws_lambda_function.process_task.arn}:*",
    ]
  }

  statement {
    sid    = "WriteExecutionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }
}

resource "aws_cloudwatch_log_group" "sfn_logs" {
  name              = "/aws/states/${local.prefix}-task-workflow"
  retention_in_days = 30
}
