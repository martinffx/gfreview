# gfreview - Project Guidelines

## Runtime

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Atelier Workflow (Spec-Driven Development)

This project follows the atelier workflow with beads for task tracking.

### Workflow Commands

| Command           | Description                           |
| ----------------- | ------------------------------------- |
| `/spec:research`  | Create spec.md from requirements      |
| `/spec:plan`      | Create plan.json from approved spec   |
| `/spec:implement` | Execute implementation from plan.json |
| `/spec:finish`    | Complete and push work                |

### Session Protocol

1. **Start session**: `bd ready` — Find unblocked work
2. **Claim task**: `bd update <id> --claim` — Claim and start work
3. **Work**: Implement following TDD (write test → verify fail → implement → verify pass)
4. **Run quality gates**: `bun run types && bun run lint && bun run format:check` (after each task)
5. **Commit**: `git add -A && git commit -m "..."` (after each task)
6. **Add notes**: Document progress with `bd note <id> "progress update"`
7. **Complete task**: `bd close <id> --reason "done"`
8. **Push**: `bd dolt push` (if configured) or `git push`

### Task Tracking

- **bd** for persistent, multi-session work with dependencies
- **TodoWrite** for single-session, linear tasks

Use `bd` when:

- Work spans multiple sessions or days
- Tasks have dependencies or blockers
- Need to survive conversation compaction

### Key Files

| File                                        | Purpose                    |
| ------------------------------------------- | -------------------------- |
| `docs/specs/YYYY-MM-DD-<feature>/spec.md`   | Living specification       |
| `docs/specs/YYYY-MM-DD-<feature>/plan.json` | Implementation plan        |
| `.beads/beads.jsonl`                        | Task tracking (git-backed) |

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - `bd create` for anything that needs follow-up
2. **Run quality gates** (if code changed) - `bun run types && bun run lint && bun run format:check && bun test`
3. **Update issue status** - `bd close` finished work, `bd update` in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
