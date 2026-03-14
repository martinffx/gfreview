---
name: gfreview
description: Use when reviewing PRs, posting inline diff comments, addressing PR feedback, or any code review workflow.
---

# gfreview

gfreview is a CLI tool for posting inline diff comments on merge/pull requests from the terminal. It provides a consistent interface across GitHub and GitLab forges.

## Configuration
- GFREVIEW_TOKEN - Required. GitHub PAT or GitLab token
- GFREVIEW_URL - Default: https://github.com or https://gitlab.com
- GFREVIEW_FORGE - gitlab or github (auto-detected from git remote)
- GFREVIEW_PROJECT - Optional: owner/repo or group/project

## Agent Workflow

When performing a code review on a PR/MR, follow this workflow:

### Step 0: Understand Context
gfreview view <id>

See PR title, description, author, and branches to understand what changes and why.

### Step 1: Read the diff
gfreview diff <id>

This outputs an LLM-optimized diff format with line numbers that map directly to --line arguments.

### Step 2: Start review session
gfreview review start <id>

This fetches and caches the current diff version SHAs. Required before posting comments.

### Step 3: Stage inline comments
gfreview review comment <id> --file <path> --line <n> --body <text>

Repeat for each line. Comments are staged locally (GitHub) or server-side (GitLab).

### Step 4: Check pending before submit
gfreview review status <id>

Verify all comments are staged correctly before submitting.

### Step 5: Submit review
gfreview review submit <id> [--body <text>]

This submits all staged comments as a single review. If PR updated since start, use gfreview review refresh <id> or gfreview review discard <id>.

### Step 6: Verify
gfreview discussions <id>

## Diff Format
gfreview diff outputs:
FILE src/foo.ts
CHUNK 42-61
+ 42  const result = await processTransaction(tx);
+ 43  return result;

Line number rules:
- + prefix = added line, use new file line number
- - prefix = removed line, use old file line number
- space prefix = context line, use new file line number

## Gotchas

- Stale SHAs: If PR updates during review, submit fails. Use review refresh or review discard.
- Line number mapping: Numbers in diff output work directly with --line.

## Error Codes

- 0 - Success
- 1 - User error
- 2 - API error
- 3 - Stale review

## References

See references/commands.md and references/workflows.md.

## Writing Good Review Comments

Be specific:
- Bad: "This could be improved"
- Good: "Consider extracting this logic into a separate validateInput() function"

Explain why:
- Bad: "Use const here"
- Good: "Use const since this variable is never reassigned"

Suggest solutions:
- Bad: "This is slow"
- Good: "This O(n²) loop could be O(n) using a Map for lookups"

Use prefixes for severity:
- Nit: - Minor style suggestion
- Suggestion: - Optional improvement
- Issue: - Should be addressed before merge
- Blocker: - Must be fixed

## Multi-line Comments

For commenting on a range of lines:
gfreview review comment <id> --file <path> --line-start <n> --line-end <m> --body <text>

## Body Input Methods

For long comments, read from file:
gfreview review comment <id> --file <path> --line <n> --body @/path/to/comment.md

Or from stdin:
echo "Multi-line comment" | gfreview review comment <id> --file <path> --line <n> --body -

## Forge Differences

| Aspect | GitHub | GitLab |
|--------|--------|--------|
| Comment staging | Local (until submit) | Server-side (draft notes) |
| Draft reviews | Local only | Server-side (accessible anywhere) |
| Submit | Single POST /reviews with all comments | POST /draft_notes/bulk_publish |

## Common Errors

"Review not started" - Run gfreview review start <id> first
"Line out of range" - Re-run gfreview diff <id> to get current line numbers
"Permission denied" - Token lacks repo scope (GitHub) or project access (GitLab)
