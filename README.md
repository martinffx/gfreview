# gfreview

CLI for posting inline diff comments on merge/pull requests from the terminal.

## Installation

```bash
bun install
bun run build
```

## Configuration

Environment variables:

- `GFREVIEW_TOKEN` — Required (GitHub PAT or GitLab token)
- `GFREVIEW_URL` — Default: https://github.com or https://gitlab.com
- `GFREVIEW_FORGE` — gitlab or github (auto-detected)
- `GFREVIEW_PROJECT` — Optional: owner/repo or group/project

Or use a config file at `$XDG_CONFIG_HOME/gfreview/config.toml`:

```toml
forge = "github"
url = "https://github.com"
project = "owner/repo"
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

gfreview diff <id> # Read annotated diff
gfreview review start <id> # Open session, cache SHAs
gfreview review comment ... # Stage comments
gfreview review submit <id> # Submit (or warn if stale)
gfreview comments <id> # Verify

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
