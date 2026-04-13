# ─────────────────────────────────────────────────────────────────────────────
# GITHUB ACTIONS OIDC
#
# Allows GitHub Actions workflows to authenticate to AWS without any long-lived
# access keys. The workflow exchanges a GitHub-issued JWT for temporary AWS
# credentials by assuming the ci_deploy role.
#
# This whole file is conditional on github_org and github_repo being set.
# Leave those variables empty to skip OIDC entirely.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  setup_oidc = var.github_org != "" && var.github_repo != ""
}

# ── OIDC Identity Provider ────────────────────────────────────────────────────
# Registers GitHub as a trusted identity provider for this AWS account.
# Only needs to exist once per account.

resource "aws_iam_openid_connect_provider" "github" {
  count = local.setup_oidc ? 1 : 0

  url = "https://token.actions.githubusercontent.com"

  # GitHub's OIDC thumbprint — this is the SHA-1 of GitHub's TLS certificate root
  # See: https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  client_id_list = ["sts.amazonaws.com"]
}

# ── CI Deploy Role ────────────────────────────────────────────────────────────
# This is the role your GitHub Actions workflow will assume.
# It has AdministratorAccess for now — you can narrow this later once
# you know exactly what your CI pipeline needs to deploy.

resource "aws_iam_role" "ci_deploy" {
  count = local.setup_oidc ? 1 : 0

  name        = "github-actions-deploy"
  description = "Assumed by GitHub Actions via OIDC - no long-lived keys needed"

  assume_role_policy = data.aws_iam_policy_document.github_oidc_trust[0].json

  # Limit how long a workflow can hold these credentials
  max_session_duration = 3600 # 1 hour
}

data "aws_iam_policy_document" "github_oidc_trust" {
  count = local.setup_oidc ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github[0].arn]
    }

    # Only allow specific branches of your specific repo — not any repo on GitHub
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = concat(
        [
          for branch in var.github_branches :
          "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/${branch}"
        ],
        [
          "repo:${var.github_org}/${var.github_repo}:pull_request"
        ]
      )
    }
  }
}

resource "aws_iam_role_policy_attachment" "ci_deploy_admin" {
  count = local.setup_oidc ? 1 : 0

  role       = aws_iam_role.ci_deploy[0].name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
