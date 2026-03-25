---
name: gfreview
description: Use when the user wants to interact with GitHub PRs or GitLab MRs from the terminal - viewing PRs, posting comments, creating PRs, etc.
---

# gfreview

CLI tool for interacting with GitHub PRs and GitLab MRs from the terminal.

## Configuration

| Variable     | Description                              |
| ------------ | ---------------------------------------- |
| GITHUB_TOKEN | GitHub PAT                               |
| GITLAB_TOKEN | GitLab token                             |
| GITLAB_URL   | GitLab URL (default: https://gitlab.com) |

CLI flags: `--forge github|gitlab`, `--project owner/repo`, `--token`

## Commands

### PR Listing

```
gfreview list [--state open|closed|all] [--limit n]
gfreview view <id>
```

### PR Creation

```
gfreview create --title <title> --source-branch <branch> --target-branch <branch> [--description <text>] [--draft]
```

### PR Actions

```
gfreview approve <id>
gfreview merge <id>
```

### Immediate Comments (No Review Session)

Post comments immediately without starting a review session.

```
gfreview post <id> --file <path> --line <n> --body <text>  # Line comment
gfreview post <id> --body <text>                            # General comment
gfreview post <id> --file <path> --line <n> --severity blocker --body <text>
gfreview post <id> --file <path> --line <n> --body-file <path>
```

### Batched Review (Start → Comment → Submit)

Comments grouped in one review with a summary.

```
gfreview review start <id>                      # Create pending review
gfreview review comment <id> --file <path> --line <n> --body <text>  # Add to pending review
gfreview review submit <id> [--body <summary>]  # Submit review
gfreview review status <id>                    # Show pending comments
gfreview review discard <id>                   # Delete pending review
```

### Diff & Comments

```
gfreview diff <id>          # Show diff with line numbers
gfreview comments <id>       # List posted comments
```

## Options

| Flag                 | Description                                        |
| -------------------- | -------------------------------------------------- |
| `--body <text>`      | Comment body (use `@path` for file, `-` for stdin) |
| `--body-file <path>` | Read body from file                                |
| `--severity`         | blocker, issue, suggestion, nit                    |
| `--side`             | new (default) or old                               |
| `--json`             | JSON output                                        |
| `--verbose`          | Verbose output                                     |

## Severity Levels

Use `--severity` to categorize line comments:

| Level      | Description                      |
| ---------- | -------------------------------- |
| blocker    | Must be fixed before merge       |
| issue      | Should be addressed before merge |
| suggestion | Optional improvement             |
| nit        | Minor style suggestion           |

Severity is prepended to the comment body.

## Line Number Mapping

For `--line`, use numbers from `gfreview diff <id>`:

| Diff prefix | Side |
| ----------- | ---- |
| `-` (red)   | old  |
| `+` (green) | new  |
| space       | new  |

## Body Input

```bash
--body "inline text"
--body @/path/to/file.md
--body-file /path/to/file.md
cat file.md | gfreview post <id> --file <path> --line <n> --body -
```

## Error Codes

| Code | Meaning                    |
| ---- | -------------------------- |
| 0    | Success                    |
| 1    | User error (invalid input) |
| 2    | API error                  |
| 3    | Stale review               |

## Forge Differences

| Aspect           | GitHub          | GitLab          |
| ---------------- | --------------- | --------------- |
| Line comments    | Comments API    | Discussions API |
| General comments | Issues API      | Notes API       |
| Review batching  | Pending reviews | Draft notes     |
