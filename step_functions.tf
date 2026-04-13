resource "aws_sfn_state_machine" "task_workflow" {
  name     = "${local.prefix}-task-workflow"
  role_arn = aws_iam_role.sfn_exec.arn
  type     = "STANDARD"

  definition = jsonencode({
    Comment = "Task processing workflow: validate -> process task -> notify"
    StartAt = "ValidateTask"

    States = {

      ValidateTask = {
        Type     = "Task"
        Resource = aws_lambda_function.validate_task.arn
        Next     = "ProcessTask"

        Retry = [{
          ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
          IntervalSeconds = 2
          MaxAttempts     = 3
          BackoffRate     = 2.0
          JitterStrategy  = "FULL"
        }]

        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "TaskFailed"
          ResultPath  = "$.error"
        }]
      }

      ProcessTask = {
        Type     = "Task"
        Resource = aws_lambda_function.process_task.arn
        Next     = "TaskSucceeded"

        Retry = [{
          ErrorEquals     = ["States.ALL"]
          IntervalSeconds = 2
          MaxAttempts     = 3
          BackoffRate     = 2.0
          JitterStrategy  = "FULL"
        }]

        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "FailTask"
          ResultPath  = "$.error"
        }]
      }

      FailTask = {
        Type     = "Task"
        Resource = aws_lambda_function.fail_task.arn
        Next     = "TaskFailed"

        Retry = [{
          ErrorEquals     = ["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "Lambda.TooManyRequestsException"]
          IntervalSeconds = 2
          MaxAttempts     = 3
          BackoffRate     = 2.0
          JitterStrategy  = "FULL"
        }]

        Catch = [{
          ErrorEquals = ["States.ALL"]
          Next        = "TaskFailed"
          ResultPath  = "$.error"
        }]
      }

      TaskSucceeded = {
        Type = "Succeed"
      }

      TaskFailed = {
        Type  = "Fail"
        Error = "TaskProcessingFailed"
        Cause = "Task failed — check $.error in the execution event for details"
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn_logs.arn}:*"
    include_execution_data = true
    level                  = "ERROR"
  }

  tracing_configuration {
    enabled = true
  }
}
