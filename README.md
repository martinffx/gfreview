# Git Forge Review

Agentic code review for git forges.

gfreview gives AI coding agents (Claude Code, Codex, Gemini CLI) a way
to review pull requests and leave inline comments — no MCP server, no
browser, no screenshots. Just a CLI that talks to the forge API.

Stage draft comments, submit reviews, and manage discussions from the
terminal. Works with GitHub and GitLab.

## Installation

### Quick Install (curl | bash)

```bash
curl -fsSL https://raw.githubusercontent.com/martinffx/gfreview/main/install.sh | bash
```

#### Options

```bash
# Install to custom location (default: /usr/local/bin)
curl -fsSL https://raw.githubusercontent.com/martinffx/gfreview/main/install.sh | BIN_DIR=~/.local/bin bash

# Install specific version
curl -fsSL https://raw.githubusercontent.com/martinffx/gfreview/main/install.sh | VERSION=v0.1.0 bash
```

### npm

```bash
npm install -g gfreview
```

### From Source

```bash
bun install
bun run build
```

## Configuration

### Environment Variables

| Variable       | Description                                       |
| -------------- | ------------------------------------------------- |
| `GITLAB_TOKEN` | GitLab access token (sets forge to GitLab)        |
| `GITHUB_TOKEN` | GitHub PAT (sets forge to GitHub)                 |
| `GITLAB_URL`   | GitLab instance URL (default: https://gitlab.com) |

**Auto-detection:**

- **Forge**: Determined by which token is set (`GITLAB_TOKEN` → GitLab, `GITHUB_TOKEN` → GitHub)
- **Project**: Parsed from `git remote get-url origin` if run inside a git repository
- **GitHub URL**: Always uses `https://api.github.com`

Override auto-detected values with CLI flags:

```
gfreview list --project owner/repo     # Override project
gfreview list --forge gitlab           # Override forge
```

## Usage

### PR Management

```
gfreview list                              # List open PRs
gfreview view <id>                         # Show PR details
gfreview create --title <title> --source-branch <branch> --target-branch <branch>
gfreview approve <id>
gfreview merge <id>
```

### Review Workflow

```
gfreview review start <id>                                       # Open session, cache SHAs
gfreview review comment <id> --file <path> --line <n> --body <text>
gfreview review submit <id> [--body <text>]
gfreview review status <id>
gfreview review discard <id>
```

### Comments

```
gfreview diff <id>
gfreview comments <id>
gfreview resolve <id> --discussion-id <id>
gfreview note <id> --body <text>
```

### Shared Flags

- --forge gitlab|github — Override detected forge
- --project <path> — Override project
- --json — JSON output
- --body - | @<path> — Read body from stdin or file

## Diff Format

gfreview diff outputs an LLM-optimized format with line numbers that map directly to --line arguments.

## Agent Workflow

```bash
gfreview diff <id> # Read annotated diff
gfreview review start <id> # Open session, cache SHAs
gfreview review comment ... # Stage comments
gfreview review submit <id> # Submit (or warn if stale)
gfreview comments <id> # Verify
```

## Development

- bun test — Run tests
- bun run types — Type check
- bun run lint — Lint
- bun run format:check — Check formatting
- bun run build — Compile to binary

## Architecture

- v0.1: GitHub support
- v0.2: GitLab support (architecture in place)

The CLI uses a forge-agnostic interface — GitLab and GitHub clients implement the same API.
