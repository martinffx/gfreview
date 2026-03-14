# gfreview — PRD v0.4

## Problem

No ergonomic CLI exists for posting inline diff comments on merge/pull requests from the terminal. Official CLIs (`glab`, `gh`) support general comments but have no `--file` or `--line` flags for diff-level feedback. The underlying APIs support everything needed, but using them directly requires SHA fetching, position construction, and line number mapping — too much boilerplate for agent or script use.

`gfreview` wraps this into a purpose-built CLI with a consistent interface across forges. The first supported forge is GitLab.

-----

## Goals

- Post inline comments on PR diff lines from a single command
- Read and display inline discussions on a PR
- Work as a scriptable tool an agent can call without a TUI
- Consistent CLI interface regardless of which forge is in use
- Support both hosted and self-hosted forge instances

## Non-goals

- TUI or interactive review mode
- Full repository/project management (that's `glab` / `gh`)
- GitHub support in v0.1 — architecture must support it, implementation deferred

-----

## Forge abstraction

Each forge implements the `ForgeClient` interface. The CLI layer calls only into this interface — no forge-specific logic above the client boundary.

```
┌─────────────────────────────────┐
│           CLI commands          │
│  list / view / diff / review    │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│         ForgeClient             │  (interface)
│  startReview, addReviewComment  │
│  submitReview, getDiff, ...     │
└────────────┬────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼───┐       ┌────▼───┐
│GitLab │       │ GitHub │  (future)
│client │       │ client │
└───────┘       └────────┘
```

The active forge is selected by config or auto-detected from `git remote get-url origin`.

### ForgeClient interface

The interface describes the caller's intent — start a review, add a comment, submit — without prescribing how each forge implements it. GitLab uses server-side draft notes. GitHub batches comments into a single API call on submit. Neither detail is visible above the client boundary.

```typescript
interface ForgeClient {
  // PR management
  listPRs(opts: ListOpts): Promise<PR[]>
  getPR(id: number): Promise<PR>
  createPR(opts: CreateOpts): Promise<PR>
  deletePR(id: number): Promise<void>
  approvePR(id: number): Promise<void>
  unapprovePR(id: number): Promise<void>
  mergePR(id: number): Promise<void>

  // Diff
  getDiff(id: number): Promise<FileDiff[]>
  getVersions(id: number): Promise<DiffVersion[]>

  // Review
  startReview(id: number): Promise<ReviewSession>
  addReviewComment(id: number, opts: ReviewCommentOpts): Promise<ReviewComment>
  listReviewComments(id: number): Promise<ReviewComment[]>
  deleteReviewComment(id: number, commentId: string): Promise<void>
  submitReview(id: number, opts?: SubmitOpts): Promise<void>
  discardReview(id: number): Promise<void>

  // Discussions (published threads)
  listDiscussions(id: number): Promise<Discussion[]>
  postNote(id: number, body: string): Promise<Note>
  resolveThread(id: number, discussionId: string, resolved: boolean): Promise<void>
}
```

The `id` parameter is the PR identifier for the forge — `iid` on GitLab, `number` on GitHub. Each client maps it accordingly.

### Key types

```typescript
interface ReviewSession {
  startedAt: string                  // ISO 8601
  versions: DiffVersion              // cached SHAs at start time
}

interface DiffVersion {
  headSha: string
  baseSha: string
  startSha: string
}

interface ReviewCommentOpts {
  file: string
  line: number                       // new-file line for added/context, old-file line for removed
  lineEnd?: number                   // for multi-line comments
  side: 'new' | 'old'               // which side of the diff the line refers to
  body: string
}

interface ReviewComment {
  id: string
  file: string
  line: number
  lineEnd?: number
  side: 'new' | 'old'
  body: string
}

interface SubmitOpts {
  body?: string                      // optional summary comment
}
```

### Implementation strategies

**GitLab client:** `startReview` fetches `/versions` and caches SHAs. `addReviewComment` creates a server-side draft note via `POST /draft_notes` with a position object built from the cached SHAs. `listReviewComments` reads drafts from the server. `submitReview` re-fetches versions, compares SHAs for staleness, then calls `POST /draft_notes/bulk_publish`. `discardReview` deletes all draft notes and clears local session state. Because drafts live server-side, a review started on one machine can be inspected or submitted from another.

**GitHub client:** `startReview` fetches the PR head SHA and caches it. `addReviewComment` writes to local session state — GitHub has no server-side draft comment API. `listReviewComments` reads from local state. `submitReview` packs all staged comments into a single `POST /reviews` call with a `comments` array. `discardReview` clears local session state. Because drafts are local, a review can only be managed from the machine where it was started.

-----

## Configuration

Token is read from the environment — never stored in config files.

```
GFREVIEW_TOKEN=...       # required — forge PAT
GFREVIEW_URL=...         # default depends on forge (https://gitlab.com, https://github.com)
GFREVIEW_FORGE=gitlab    # gitlab | github — auto-detected if omitted
GFREVIEW_PROJECT=...     # optional: group/repo or numeric project ID
```

Additional defaults via `$XDG_CONFIG_HOME/gfreview/config.toml` (falls back to `~/.config/gfreview/config.toml`):

```toml
forge   = "gitlab"
url     = "https://gitlab.example.com"
project = "mygroup/myrepo"
```

`--project` and `--forge` flags on any command override config. If project is omitted and inside a git repo, inferred from `git remote get-url origin`.

-----

## Commands

The command interface is forge-agnostic. Forge differences are invisible to the caller.

### PR management

```
gfreview list                          # list open PRs
gfreview view <id>                     # show details (title, description, status, reviewers)
gfreview create                        # create PR
gfreview delete <id>
gfreview approve <id>
gfreview unapprove <id>
gfreview merge <id>
```

### Review workflow

Comments are staged and submitted as a single review. Where the staging happens depends on the forge — server-side draft notes on GitLab, local state on GitHub. The CLI commands are identical either way.

```
gfreview review start <id>
gfreview review comment <id> \
  --file <path> --line <n> --body <text>
gfreview review comment <id> \
  --file <path> --line-start <n> --line-end <m> --body <text>
gfreview review submit <id>
gfreview review discard <id>
gfreview review status <id>            # list pending comments
```

`review start` fetches and caches the current diff version SHAs. Subsequent `review comment` calls use these cached SHAs to construct position objects (GitLab) or store them for the submit payload (GitHub).

On `review submit`, the CLI re-fetches versions from the forge and compares them against the cached SHAs. If the PR has been updated since `review start` (i.e. someone pushed new commits), the CLI warns and aborts:

```
error: PR #42 has been updated since review start.
  cached head: f9ce7e1
  current head: a3b8d02
Run `gfreview review refresh <id>` to update, or `gfreview review discard <id>` to start over.
```

On GitLab, pending draft notes are still accessible server-side and can be reviewed with `gfreview review status <id>`. On GitHub, pending comments exist only in local state.

`review refresh <id>` re-fetches SHAs and re-stages each comment against the new diff version. On GitLab this means deleting and recreating server-side drafts. On GitHub it means updating local state. Comments that can't be mapped (file deleted, line no longer exists) are reported as conflicts for the user to resolve.

`review discard` removes all pending comments and clears session state.

### Discussions

```
gfreview diff <id>                     # annotated diff with line numbers
gfreview discussions <id>              # list all threads
gfreview resolve <id> --discussion-id <did>
gfreview unresolve <id> --discussion-id <did>
gfreview note <id> --body <text>       # general (non-inline) comment
```

### Shared flags

- `--forge gitlab|github` — override detected forge
- `--project <id or path>` — override config/detected project
- `--json` — structured JSON output on any command
- `--state open|merged|closed|all` — on `list` and `view`
- `--body -` — read body from stdin
- `--body @<path>` — read body from file

`list` also accepts `--assignee`, `--reviewer`, `--label`.

`create` accepts `--title`, `--description`, `--source-branch`, `--target-branch`, `--draft` for non-interactive use.

-----

## Diff format

`gfreview diff <id>` outputs a custom format optimised for LLM consumption. Identical across all forges.

```
FILE src/payments/clearing.ts
CHUNK 42-61
+ 42  const result = await processTransaction(tx);
+ 43  return result;
  44  }
- 45  // old implementation
CHUNK 88-95
  88  export function buildPayload(
+ 89    options: PayloadOptions,
```

Rules:

- `FILE` header per file, then one or more `CHUNK` blocks with the affected line range
- Each line prefixed with `+` (added), `-` (removed), or space (context)
- The number after the prefix is the **new file line number** for added/context lines, **old file line number** for removed lines — exactly what `gfreview review comment --line` expects
- No unified diff `@@` headers, no SHA noise, no ANSI colour codes

When old and new line numbers diverge (due to earlier insertions or deletions shifting lines), context lines use the new file line number. Here's an example where a 3-line insertion at line 10 shifts all subsequent context lines:

```
FILE src/reconciler.ts
CHUNK 8-18
  8   const batch = await fetchBatch(cursor);
  9   if (!batch.length) break;
+10   logger.info(`Processing ${batch.length} items`);
+11   metrics.increment('batches_processed');
+12   metrics.gauge('batch_size', batch.length);
  13  for (const item of batch) {
  14    await processItem(item);
```

Lines 13–14 in the new file were lines 10–11 in the old file. The `--line 13` and `--line 14` values from the diff output work directly with `gfreview review comment` — no translation required.

-----

## Agent workflow

```
gfreview diff <id>                                               # 1. read annotated diff
gfreview review start <id>                                       # 2. open session, cache SHAs
gfreview review comment <id> --file ... --line ... --body ...    # 3. stage comments
gfreview review submit <id>                                      # 4. submit (or warn if stale)
gfreview discussions <id>                                        # 5. verify
```

-----

## GitLab client — API mapping

Base URL: `$GFREVIEW_URL/api/v4`

All requests require `PRIVATE-TOKEN: $GFREVIEW_TOKEN` header.

### PR management

|Operation|Method|Endpoint                                     |
|---------|------|---------------------------------------------|
|list     |GET   |`/projects/:id/merge_requests`               |
|view     |GET   |`/projects/:id/merge_requests/:iid`          |
|create   |POST  |`/projects/:id/merge_requests`               |
|delete   |DELETE|`/projects/:id/merge_requests/:iid`          |
|approve  |POST  |`/projects/:id/merge_requests/:iid/approve`  |
|unapprove|POST  |`/projects/:id/merge_requests/:iid/unapprove`|
|merge    |PUT   |`/projects/:id/merge_requests/:iid/merge`    |

### Diff and versions

```
GET /projects/:id/merge_requests/:iid/versions
```

Returns diff versions newest-first. The first item has the three SHAs required for every inline comment position:

```json
{
  "head_commit_sha": "f9ce7e...",
  "base_commit_sha": "5e6dff...",
  "start_commit_sha": "5e6dff..."
}
```

```
GET /projects/:id/merge_requests/:iid/diffs
```

Returns per-file diff objects with `old_path`, `new_path`, and a unified `diff` string. The deprecated `/changes` endpoint should not be used.

### Review workflow → Draft Notes API

The GitLab client maps review operations to the Draft Notes API. Drafts are server-side and visible only to the author until published.

|ForgeClient method|API call|
|------------------|--------|
|`startReview`|`GET /versions` (cache SHAs)|
|`addReviewComment`|`POST /draft_notes` with position object|
|`listReviewComments`|`GET /draft_notes`|
|`deleteReviewComment`|`DELETE /draft_notes/:id`|
|`submitReview`|`GET /versions` (staleness check) then `POST /draft_notes/bulk_publish`|
|`discardReview`|`DELETE /draft_notes/:id` for each draft|

**Creating an inline draft note:**

```
POST /projects/:id/merge_requests/:iid/draft_notes
```

```
note                     = "your comment"
position[position_type]  = "text"
position[base_sha]       = <from cached versions>
position[head_sha]       = <from cached versions>
position[start_sha]      = <from cached versions>
position[new_path]       = "src/foo.ts"
position[old_path]       = "src/foo.ts"
position[new_line]       = 42             # added or unchanged line
# position[old_line]     = 42             # removed line — mutually exclusive with new_line
```

Line rules:

- Added line (`side: 'new'`): `new_line` only
- Removed line (`side: 'old'`): `old_line` only
- Unchanged line: both (values may differ if earlier hunks shifted line numbers)

Multi-line comments require a `line_range` object with `start` and `end` blocks, each containing a `line_code` of the form `<SHA1_of_file_path>_<old_line>_<new_line>`. The SHA1 is of the file path string, not a commit.

**Bulk publish:**

```
POST /projects/:id/merge_requests/:iid/draft_notes/bulk_publish
```

Publishes all pending drafts in a single operation — one notification email to PR participants.

### Discussions

**List discussions:**

```
GET /projects/:id/merge_requests/:iid/discussions
```

Returns paginated threads. Each has `id`, `individual_note` (true = general, false = diff thread), and `notes[]`. Diff threads include a `position` object with file, line, and SHA info.

**Resolve/unresolve:**

```
PUT /projects/:id/merge_requests/:iid/discussions/:discussion_id
{ "resolved": true }
```

**General note:**

```
POST /projects/:id/merge_requests/:iid/notes
{ "body": "..." }
```

### SHA handling

The three SHAs must always come from `/versions` — not `git log` or the PR object. Stale SHAs produce `400 Bad Request` with no useful message. The client fetches fresh versions on `startReview` and caches them in the local session. On `submitReview`, versions are re-fetched and compared — see the stale SHA handling described in the review workflow section above.

-----

## GitHub client — API mapping (future)

To be implemented in v0.2.

|ForgeClient method|API call|
|------------------|--------|
|`startReview`|`GET /pulls/:number` (cache head SHA)|
|`addReviewComment`|Write to local session state|
|`listReviewComments`|Read from local session state|
|`deleteReviewComment`|Delete from local session state|
|`submitReview`|`POST /reviews` with `comments` array and `event`|
|`discardReview`|Clear local session state|

GitHub's Reviews API accepts all comments in a single `POST /reviews` call. There is no server-side incremental draft API — comments are staged locally and packed into the submit payload.

Relevant endpoints:

```
POST /repos/:owner/:repo/pulls/:number/reviews         # create + submit review with comments
GET  /repos/:owner/:repo/pulls/:number/comments        # list published inline comments
GET  /repos/:owner/:repo/pulls/:number/files            # diff
```

GitHub requires a `commit_id` (HEAD SHA) and `path` + `line` for each comment. No three-SHA position object — simpler than GitLab.

Key difference from GitLab: `review status` only works on the machine where the review was started, since drafts live in local state rather than server-side.

-----

## Local state

The CLI stores session state at `$XDG_DATA_HOME/gfreview/sessions/<forge>/<project_id>/<id>.json` (falls back to `~/.local/share/gfreview/sessions/...`).

**GitLab session** (drafts live server-side, local file is a lightweight index):

```json
{
  "startedAt": "2026-03-14T10:00:00Z",
  "versions": {
    "headSha": "f9ce7e...",
    "baseSha": "5e6dff...",
    "startSha": "5e6dff..."
  },
  "draftNoteIds": [101, 102, 103]
}
```

**GitHub session** (drafts live locally, local file is the source of truth):

```json
{
  "startedAt": "2026-03-14T10:00:00Z",
  "versions": {
    "headSha": "f9ce7e..."
  },
  "comments": [
    {
      "id": "local-1",
      "file": "src/foo.ts",
      "line": 42,
      "side": "new",
      "body": "your comment"
    }
  ]
}
```

-----

## Implementation notes

- Language: TypeScript, compiled to a single binary via `bun build --compile`
- All forge-specific logic lives inside the client implementations — zero leakage into CLI layer
- Line numbers in `gfreview diff` output map directly to `--line` args — no translation needed
- The `ForgeClient` interface describes caller intent, not forge mechanics — implementations choose how to stage and submit
