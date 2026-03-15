# Missing CLI Commands

## Problem

The README documents several commands that are not yet implemented:

- `gfreview create` - Create PRs
- `gfreview resolve` - Resolve discussions
- `gfreview note` - Add general comments
- `--body - | @<path>` - Read body from stdin or file
- `review submit --body` - Submit review with summary text

## Scope

**In scope:**

- `create` command to create PRs from CLI
- `--body` flag supporting stdin (`-`) and file (`@path`) input
- `review submit --body` for review summary text
- `note` command for general PR comments
- `resolve` command (with GitHub limitation handling)

**Out of scope:**

- Interactive PR creation (TUI)
- Batch comment operations
- Complex body formatting (markdown preview)

## User Stories

**US-1: Create PR from CLI** (must)

- As a developer, I want to create a PR from the terminal, so that I can automate PR creation in scripts.
- Given I have a source branch and target branch, when I run `gfreview create --title <title> --source-branch <branch> --target-branch <branch>`, then a PR is created.

**US-2: Read body from stdin** (must)

- As an AI agent, I want to pipe comment text into gfreview, so that I can automate code reviews.
- Given I have text in stdin, when I run `gfreview review comment <id> --body -`, then the stdin content is used as the comment body.

**US-3: Read body from file** (must)

- As a reviewer, I want to read a prepared comment from a file, so that I can write lengthy comments in my editor.
- Given I have a file with comment text, when I run `gfreview review comment <id> --body @/path/to/comment.txt`, then the file content is used as the comment body.

**US-4: Submit review with summary** (must)

- As a reviewer, I want to include a summary with my review, so that I can provide overall feedback.
- Given I have staged comments, when I run `gfreview review submit <id> --body <text>`, then the summary is included in the review.

**US-5: Add general note** (should)

- As a reviewer, I want to add a general comment to a PR (not on a specific line), so that I can provide feedback that applies to the whole PR.
- Given I have a PR, when I run `gfreview note <id> --body <text>`, then a general comment is added to the PR.

**US-6: Resolve discussion** (could)

- As a reviewer, I want to resolve a discussion, so that I can mark it as addressed.
- Given I have a discussion ID, when I run `gfreview resolve <id> --discussion-id <did>`, then the discussion is resolved.

## Context

### What exists today

**Already implemented in GitHubClient:**

- `createPR()` - Creates a PR via GitHub API
- `approvePR()` - Approves a PR
- `mergePR()` - Merges a PR

**Already implemented in ForgeClient interface:**

- `createPR(opts)` - Interface defined
- `resolveDiscussion()` - Interface defined (throws for GitHub)
- `unresolveDiscussion()` - Interface defined (throws for GitHub)

**Missing from CLI (Commands.ts):**

- `create` command - Not wired up
- `resolve` command - Not wired up
- `note` command - Not wired up
- `--body` flag handling for stdin/file
- `review submit --body` - Not wired up

### Existing patterns

**CLI commands follow this pattern:**

```typescript
const cmd = program.command('name <arg>');
cmd.description('Description');
cmd.option('-o, --option <value>', 'Option description');
cmd.action(async (arg: string, options: {}) => {
  await runCommand(async () => {
    // business logic
  }, options);
});
```

**Global options are parsed via:**

```typescript
program.opts() as GlobalOptions;
```

**Error handling uses:**

```typescript
async function runCommand<T>(fn: () => Promise<T>, opts: GlobalOptions): Promise<T>;
```

## Architecture

### Component structure

```
CLI Layer (Commands.ts)
├── create command → GitHubClient.createPR()
├── note command → GitHubClient.addNote() [new method]
├── resolve command → GitHubClient.resolveDiscussion()
├── review submit --body → GitHubClient.submitReview(opts.summary)
└── Body parsing utility → readBodyFromArg(value: string): Promise<string>
```

### New utility function

**BodyReader** - Handles `--body - | @<path>` parsing:

```typescript
export async function readBodyFromArg(value: string | undefined): Promise<string | undefined> {
  if (!value) return undefined;

  if (value === '-') {
    // Read from stdin
    const chunks: string[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return chunks.join('');
  }

  if (value.startsWith('@')) {
    // Read from file
    const filePath = value.slice(1);
    return await Bun.file(filePath).text();
  }

  // Direct string value
  return value;
}
```

### Changes needed

| File                         | Change                                                  |
| ---------------------------- | ------------------------------------------------------- |
| `src/cli/Commands.ts`        | Add create, note, resolve commands; wire --body parsing |
| `src/client/GitHubClient.ts` | Add `addNote()` method for general comments             |
| `src/client/ForgeClient.ts`  | Add `addNote()` interface (optional for GitHub)         |
| `src/entity/Schemas.ts`      | Add Note types if needed                                |

## API Design

### New CLI commands

```
gfreview create --title <title> --source-branch <branch> --target-branch <branch> [--description] [--draft]
gfreview note <id> --body <text>
gfreview resolve <id> --discussion-id <id>
gfreview review submit <id> --body <text>
```

### Body input handling

| Input         | Example                 | Behavior                 |
| ------------- | ----------------------- | ------------------------ |
| Direct string | `--body "Hello"`        | Use string directly      |
| Stdin         | `--body -`              | Read all stdin until EOF |
| File          | `--body @/path/to/file` | Read file contents       |

### GitHub API calls needed

| Command   | API Endpoint                                           | Method |
| --------- | ------------------------------------------------------ | ------ |
| `create`  | `/repos/{owner}/{repo}/pulls`                          | POST   |
| `note`    | `/repos/{owner}/{repo}/issues/{issue_number}/comments` | POST   |
| `resolve` | N/A (GitHub limitation)                                | throws |

## Trade-offs

### Stdin reading approach

**Option A: `process.stdin` read (current choice)**

- ✅ Works with piped input: `echo "text" | gfreview ...`
- ✅ Works with heredocs: `gfreview ... <<EOF`
- ❌ Requires async iterator handling
- Node.js/Bun compatible

**Option B: `readline` module**

- ✅ Line-by-line processing
- ❌ More complex for multi-line input
- Node.js only

**Option C: Use `bun` stdin**

- ✅ Bun-native: `Bun.stdin.text()`
- ❌ Not Node.js compatible

Selected: Option A with `for await` loop for Node.js/Bun compatibility.

### Note command implementation

**Option A: Use Issues API (selected)**

- GitHub PRs are also issues
- `/repos/{owner}/{repo}/issues/{issue_number}/comments` works
- Creates general comment on PR

**Option B: Use Review API with line=null**

- Not supported by GitHub API

### Resolve command for GitHub

**Option A: Throw UserError (selected)**

- Clear error message explaining limitation
- Points users to web UI

**Option B: Silently no-op**

- Confusing user experience

Selected: Option A with helpful message pointing to web UI.

## Open Questions

1. **Should `note` work for GitLab?** - Need to check GitLab API for MR-level comments
2. **Should `--body` be required for `note`?** - Yes, makes sense semantically

## Implementation Notes

- All body reading happens in CLI layer (effectful)
- No changes to Service layer needed
- Tests should cover stdin/file/direct string cases
