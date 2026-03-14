# gfreview Commands Reference

## PR Management

gfreview list                              # List open PRs
gfreview view <id>                         # Show PR details
gfreview create --title <title> --source-branch <branch> --target-branch <branch>
gfreview delete <id>
gfreview approve <id>
gfreview unapprove <id>
gfreview merge <id>

## Review Workflow

gfreview review start <id>                                       # Open session, cache SHAs
gfreview review comment <id> --file <path> --line <n> --body <text>
gfreview review comment <id> --file <path> --line-start <n> --line-end <m> --body <text>
gfreview review submit <id> [--body <text>]
gfreview review status <id>
gfreview review discard <id>
gfreview review refresh <id>

## Discussions

gfreview diff <id>
gfreview discussions <id>
gfreview resolve <id> --discussion-id <id>
gfreview unresolve <id> --discussion-id <id>
gfreview note <id> --body <text>

## Shared Flags

--forge gitlab|github   # Override detected forge
--project <path>        # Override project
--json                  # JSON output
--body - | @<path>      # Read body from stdin or file
--state open|merged|closed|all  # Filter for list command
