resource "aws_sqs_queue" "failed_dlq" {
  name                      = "${local.prefix}-failed-dlq"
  message_retention_seconds = 1209600
  kms_master_key_id         = "alias/aws/sqs"
}

resource "aws_sqs_queue" "pending" {
  name                       = "${local.prefix}-pending"
  visibility_timeout_seconds = var.sqs_visibility_timeout
  message_retention_seconds  = 345600
  kms_master_key_id          = "alias/aws/sqs"

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.failed_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })
}

# resource "aws_sqs_queue_policy" "allow_sns" {
#   queue_url = aws_sqs_queue.fulfillment.id
#   policy = data.aws_iam_policy_document.sqs_allow_sns.json
# }

# data "aws_iam_policy_document" "sqs_allow_sns" {
#   statement {
#     sid    = "AllowSNSPublish"
#     effect = "Allow"

#     principals {
#       type        = "Service"
#       identifiers = ["sns.amazonaws.com"]
#     }

#     actions   = ["sqs:SendMessage"]
#     resources = [aws_sqs_queue.fulfillment.arn]

#     condition {
#       test     = "ArnEquals"
#       variable = "aws:SourceArn"
#       values   = [aws_sns_topic.order_events.arn]
#     }
#   }
# }
