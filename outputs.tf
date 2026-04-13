output "state_machine_arn" {
  description = "ARN of the Step Functions state machine — use this to start executions"
  value       = aws_sfn_state_machine.task_workflow.arn
}

output "state_machine_console_url" {
  description = "Direct link to the state machine in the AWS Console"
  value       = "https://${var.aws_region}.console.aws.amazon.com/states/home?region=${var.aws_region}#/statemachines/view/${aws_sfn_state_machine.task_workflow.arn}"
}

output "tasks_table_name" {
  description = "DynamoDB tasks table name"
  value       = aws_dynamodb_table.tasks.name
}

output "failed_dlq_url" {
  description = "Dead-letter queue URL — check here if tasks get stuck"
  value       = aws_sqs_queue.failed_dlq.url
}

output "start_execution_command" {
  description = "AWS CLI command to start a test execution"
  value       = <<-EOT
    aws stepfunctions start-execution \
      --state-machine-arn ${aws_sfn_state_machine.task_workflow.arn} \
      --region ${var.aws_region} \
      --input '{
        "taskId": "task-1",
        "payload": { "dummy": "payload" }
      }'
  EOT
}

output "check_task_command" {
  description = "AWS CLI command to read the task from DynamoDB after execution"
  value       = <<-EOT
    aws dynamodb get-item \
      --table-name ${aws_dynamodb_table.tasks.name} \
      --region ${var.aws_region} \
      --key '{"pk": {"S": "TASK#task-1"}, "sk": {"S": "DETAIL"}}'
  EOT
}

output "api_base_url" {
  description = "Base URL of the HTTP API — use this for all requests"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "http_post_task" {
  description = "curl command to submit a test task via HTTP"
  value       = <<-EOT
    curl -X POST ${aws_apigatewayv2_stage.default.invoke_url}/tasks \
      -H "Content-Type: application/json" \
      -d '{
        "taskId": "http-task-1",
        "payload": { "dummy": "payload" }
      }'
  EOT
}

output "http_get_task" {
  description = "curl command to read back the task status"
  value       = "curl ${aws_apigatewayv2_stage.default.invoke_url}/tasks/http-task-1"
}

output "ci_deploy_role_arn" {
  description = "ARN of the GitHub Actions deploy role — paste this into your workflow's role-to-assume"
  value       = local.setup_oidc ? aws_iam_role.ci_deploy[0].arn : "OIDC not configured (set github_org and github_repo variables)"
}