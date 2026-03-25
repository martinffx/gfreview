# gfreview Commands

## PR Management

| Command | Description |
|---------|-------------|
| `list [--state open\|closed\|all]` | List PRs |
| `view <id>` | Show PR details |
| `create --title <t> --source-branch <s> --target-branch <t>` | Create PR |
| `approve <id>` | Approve PR |
| `merge <id>` | Merge PR |

## Review

| Command | Description |
|---------|-------------|
| `review start <id>` | Create pending review |
| `review comment <id> --file <path> --line <n> --body <text>` | Line comment |
| `review comment <id> --body <text>` | General comment |
| `review comment <id> --file <path> --line <n> --severity blocker --body <text>` | With severity |
| `review comment <id> --file <path> --line <n> --body-file <path>` | Body from file |
| `review status <id>` | Show pending comments |
| `review submit <id> [--body <summary>]` | Submit review |
| `review discard <id>` | Delete pending review |
| `review refresh <id>` | Refresh status |

## Diff & Comments

| Command | Description |
|---------|-------------|
| `diff <id>` | Show diff with line numbers |
| `comments <id>` | List posted comments |

## Options

| Flag | Description |
|------|-------------|
| `--body <text>` | Comment body |
| `--body @path` | Body from file |
| `--body-file <path>` | Body from file |
| `--severity blocker\|issue\|suggestion\|nit` | Severity level |
| `--side new\|old` | Diff side (default: new) |
| `--json` | JSON output |
| `--verbose` | Verbose output |
| `--forge github\|gitlab` | Override forge |
| `--project <owner/repo>` | Override project |
