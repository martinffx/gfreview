# gfreview — CLI for Inline Diff Comments

## Problem

No ergonomic CLI exists for posting inline diff comments on merge/pull requests from the terminal. Official CLIs (`glab`, `gh`) support general comments but have no `--file` or `--line` flags for diff-level feedback. The underlying APIs support everything needed, but using them directly requires SHA fetching, position construction, and line number mapping — too much boilerplate for agent or script use.

`gfreview` wraps this into a purpose-built CLI with a consistent interface across forges. The first supported forge is GitHub.

## Scope

**In scope:**

- Post inline comments on PR diff lines from a single command
- Read and display inline discussions on a PR
- Work as a scriptable tool an agent can call without a TUI
- Consistent CLI interface regardless of which forge is in use
- Support both hosted and self-hosted forge instances
- GitHub support (v0.1)
- GitLab support in v0.2 — architecture must support it, implementation deferred

**Out of scope:**

- TUI or interactive review mode
- Full repository/project management (that's `glab` / `gh`)
- GitLab support in v0.1 — architecture must support it, implementation deferred

## User Stories

**US-1: Post inline comment** (must)

- As a code reviewer, I want to post a comment on a specific line of a diff, so that I can provide targeted feedback without using a web UI.
- Given I have a PR ID, file path, and line number, when I run `gfreview review comment <id> --file <path> --line <n> --body <text>`, then the comment is staged for review.

**US-2: Submit review** (must)

- As a code reviewer, I want to submit all staged comments as a single review, so that participants receive one notification instead of many.

**US-3: Read diff with line numbers** (must)

- As a code reviewer, I want to see the diff with line numbers, so that I can identify which lines to comment on.

**US-4: List discussions** (must)

- As a code reviewer, I want to see all existing discussions on a PR, so that I can understand the review context.

**US-5: Manage review session** (must)

- As a code reviewer, I want to start, view, and discard review sessions, so that I can manage my review workflow.

**US-6: Handle stale diff** (must)

- As a code reviewer, I want to be warned if the PR has been updated since I started my review, so that I don't post comments on outdated code.

**US-7: Refresh review** (should)

- As a code reviewer, I want to refresh my review against the latest diff, so that I can continue reviewing after the PR is updated.

**US-8: PR management** (should)

- As a code reviewer, I want to list, view, create, approve, and merge PRs, so that I can manage the review lifecycle.

## Constraints

- **Language:** TypeScript, compiled to a single binary via `bun build --compile`
- **Runtime:** Bun (not Node.js)
- **Validation:** Zod for all input validation and domain model validation
- **CLI:** Commander for command-line argument parsing
- **Forge abstraction:** All forge-specific logic lives inside client implementations — zero leakage into CLI layer
- **Line number mapping:** Line numbers in `gfreview diff` output map directly to `--line` args — no translation needed
- **Token handling:** Token is read from environment — never stored in config files
- **Session state:** GitLab sessions are lightweight indexes (drafts live server-side), GitHub sessions are source of truth (drafts live locally)

## Context

### What exists today

This is a greenfield project. The codebase consists of:

- `index.ts` — placeholder entry point
- `package.json` — Bun project configuration
- `tsconfig.json` — strict TypeScript configuration
- `docs/prd.md` — comprehensive product requirements

### Dependencies to add

- `zod` — validation schema library
- `commander` — CLI framework

### Existing patterns

No existing patterns — this is the first feature.

### Gotchas

- **GitLab SHA handling:** The three SHAs must always come from `/versions` — not `git log` or the PR object. Stale SHAs produce `400 Bad Request` with no useful message.
- **GitLab line codes:** Multi-line comments require `line_code` of the form `<SHA1_of_file_path>_<old_line>_<new_line>`. The SHA1 is of the file path string, not a commit.
- **GitHub draft comments:** GitHub has no server-side draft comment API — comments are staged locally and packed into the submit payload.

## Architecture

### Component structure

```
          Effectful Edge (IO)              Functional Core (Pure)
┌─────────────────────────────────┐    ┌──────────────────────────┐
│  CLI         → command parsing  │    │  Service  → orchestration│
│  GitLabClient → GitLab API      │───▶│  Entity   → domain rules │
│  Config      → config loading   │    │            → validation  │
│  Session     → state persistence│    │            → transforms  │
└─────────────────────────────────┘    └──────────────────────────┘
```

**Key Principle:** Business logic lives in the functional core (Service + Entity). IO operations live in the effectful edge. Core defines interfaces; edge implements them (dependency inversion).

### Layer breakdown

**CLI Layer** (Effectful Edge) - command parsing (Commander), config loading, output formatting
**Service Layer** (Functional Core) - review orchestration, staleness detection
**Entity Layer** (Functional Core) - domain models, Zod validation, transforms
**Client Layer** (Effectful Edge) - ForgeClient interface, API calls
**Session Layer** (Effectful Edge) - session persistence

### Domain model (Zod schemas)

- **PRSchema** - id, title, status, branches, SHAs
- **ReviewSessionSchema** - startedAt, versions, comments (GitHub) or draftNoteIds (GitLab)
- **ReviewCommentSchema** - file, line, side, body
- **DiffVersionSchema** - headSha (GitHub), baseSha/startSha (GitLab-only)
- **DiscussionSchema** - id, type, file, line, notes, resolved
- **FileDiffSchema** - oldPath, newPath, hunks

### Where business logic lives

**Entity layer:**

- Zod schemas with refinement for validation
- `ReviewSession.isStale(currentVersions)` — checks if cached SHAs differ from current

**Service layer:**

- `ReviewService.startReview(prId)` — fetches versions, creates session
- `ReviewService.addComment(prId, opts)` — validates, creates comment via client
- `ReviewService.submitReview(prId)` — checks staleness, publishes drafts
- `ReviewService.refreshReview(prId)` — re-maps comments to new diff
- `DiffService.getDiff(prId)` — fetches and formats diff
- `DiscussionService.list(prId)` — fetches and formats discussions

### Where IO lives

**Client layer:**

- `GitHubClient.getPR()` — GET `/repos/:owner/:repo/pulls/:number`
- `GitHubClient.getDiff()` — GET `/repos/:owner/:repo/pulls/:number/files`
- `GitHubClient.getVersions()` — extracts headSha from PR object
- `GitHubClient.addComment()` — stores comment in local session
- `GitHubClient.submitReview()` — POST `/repos/:owner/:repo/pulls/:number/reviews` with comments array
- `GitHubClient.listComments()` — reads from local session
- `GitLabClient.getVersions()` — GET `/projects/:id/merge_requests/:iid/versions`
- `GitLabClient.addComment()` — POST `/projects/:id/merge_requests/:iid/draft_notes`
- `GitLabClient.submitReview()` — POST `/projects/:id/merge_requests/:iid/draft_notes/bulk_publish`
- `GitLabClient.listDiscussions()` — GET `/projects/:id/merge_requests/:iid/discussions`

**Session layer:**

- `SessionStore.read(prId)` — reads session file from disk
- `SessionStore.write(prId, session)` — writes session file to disk
- `SessionStore.delete(prId)` — deletes session file

**Config layer:**

- `Config.load()` — reads environment variables and config file
- `Config.detectProject()` — runs `git remote get-url origin` to infer project

## CLI Commands

### PR management

```
gfreview list [--state open|merged|closed|all] [--assignee] [--reviewer] [--label]
gfreview view <id>
gfreview create --title <title> --source-branch <branch> --target-branch <branch> [--description] [--draft]
gfreview delete <id>
gfreview approve <id>
gfreview unapprove <id>
gfreview merge <id>
```

### Review workflow

```
gfreview review start <id>
gfreview review comment <id> --file <path> --line <n> --body <text> [--side new|old]
gfreview review comment <id> --file <path> --line-start <n> --line-end <m> --body <text>
gfreview review submit <id> [--body <text>]
gfreview review discard <id>
gfreview review status <id>
gfreview review refresh <id>
```

### Discussions

```
gfreview diff <id>
gfreview discussions <id>
gfreview resolve <id> --discussion-id <did>
gfreview unresolve <id> --discussion-id <did>
gfreview note <id> --body <text>
```

### Shared flags

```
--forge gitlab|github
--project <id or path>
--json
--body - | @<path>
```

## Error Handling

**Exit codes:**

- `0` — success
- `1` — user error (invalid arguments, missing required fields)
- `2` — API error (authentication failed, resource not found)
- `3` — stale review (PR updated since review start)

**Default output:**

- User errors: clear message only
- API errors: status code + short message
- Stale review: cached vs current SHA

**Verbose mode:** `--verbose` flag shows full API response body and stack traces.

## Decisions

### Multi-line comment handling on refresh

**Approach:** GitLab draft notes persist server-side with their position. If the file/line no longer exists, the API returns `400 Bad Request` on publish.

During `review refresh`:

1. Fetch new diff
2. For each draft note, check if the file and line still exist
3. If line exists → update position (DELETE old draft, POST new draft with new SHAs)
4. If line doesn't exist → keep the draft note and report as conflict for user to resolve
5. Multi-line where some lines missing → report as conflict

We have the draft note ID, so we can update via DELETE + POST.

### Project ID normalization

Always normalize to `group/repo` format in session state. If user provides numeric ID, resolve it via GitLab API on first use and store the resolved `group/repo` format.

### Pagination defaults

- `list`: 100 items max (configurable via `--limit`)
- `discussions`: 100 items
- `diff`: All files (no pagination on GitLab's `/diffs`)

### Session cleanup

No automatic cleanup in v1. Sessions persist until manually discarded with `review discard`.
