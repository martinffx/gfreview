# gfreview - Claude Marketplace

## Name

gfreview

## Description

Use when reviewing PRs, posting inline diff comments, addressing PR feedback, or any code review workflow.

## Categories

- Development Tools
- Code Review
- GitHub
- GitLab

## Features

- Post inline diff comments from terminal
- Forge-agnostic (GitHub and GitLab)
- Review session management
- Stale review detection and refresh
- LLM-optimized diff output

## Usage

Install gfreview CLI first:
bun install
bun run build

Configure environment:
export GFREVIEW_TOKEN=your_token
export GFREVIEW_FORGE=github
export GFREVIEW_PROJECT=owner/repo

Agent workflow:

1. gfreview diff <id> - Read annotated diff
2. gfreview review start <id> - Start review session
3. gfreview review comment <id> --file <path> --line <n> --body <text> - Add comments
4. gfreview review submit <id> - Submit all comments
5. gfreview discussions <id> - Verify

## Requirements

- Bun runtime
- gfreview CLI installed
- GitHub PAT or GitLab token
