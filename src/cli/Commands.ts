import { Command } from 'commander';

import type { Severity } from '../client/ForgeClient';
import type { Config } from '../entity/Schemas';

import { GitHubClient } from '../client/GitHubClient';
import { loadConfig } from '../Config';
import { UserError, ApiError, StaleReviewError, EXIT_CODES } from '../Errors';
import { DiffService } from '../service/DiffService';
import { DiscussionService } from '../service/DiscussionService';
import { ReviewService } from '../service/ReviewService';
import { readBodyFromArg } from './BodyReader';
import { Output } from './Output';

type GlobalOptions = {
  forge?: 'gitlab' | 'github';
  project?: string;
  token?: string;
  baseUrl?: string;
  json: boolean;
  verbose: boolean;
};

function parsePrId(id: string): number {
  if (id.startsWith('#')) {
    return parseInt(id.slice(1), 10);
  }
  return parseInt(id, 10);
}

function requireProject(config: Config): string {
  if (!config.project) {
    throw new UserError('Project required. Use --project flag or configure git remote.');
  }
  return config.project;
}

async function createClient(config: Config) {
  if (config.forge === 'github') {
    return new GitHubClient({
      baseUrl: config.baseUrl ?? 'https://api.github.com',
      token: config.token,
    });
  }
  throw new UserError('GitLab support not yet implemented.');
}

async function runCommand<T>(fn: () => Promise<T>, opts: GlobalOptions): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof UserError) {
      Output.error(error, opts);
      process.exit(EXIT_CODES.USER_ERROR);
    } else if (error instanceof StaleReviewError) {
      Output.error(error, opts);
      process.exit(EXIT_CODES.STALE_REVIEW);
    } else if (error instanceof ApiError) {
      Output.error(error, opts);
      process.exit(EXIT_CODES.API_ERROR);
    } else {
      Output.error(error instanceof Error ? error : new Error(String(error)), opts);
      process.exit(EXIT_CODES.USER_ERROR);
    }
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('gfreview')
    .description('CLI for inline diff comments on Git Forge PRs')
    .version('0.1.0');

  program
    .option('--forge <forge>', 'Forge to use (github or gitlab, defaults to git remote)')
    .option('-p, --project <id>', 'Project ID (owner/repo, defaults to git remote)')
    .option('--token <token>', 'API token (or use GITHUB_TOKEN/GITLAB_TOKEN env var)')
    .option('--base-url <url>', 'API base URL (defaults to git remote)')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Show verbose output');

  // list
  const listCmd = program.command('list');
  listCmd.description('List PRs').option('--state <state>', 'Filter by state (open, closed, all)');
  listCmd.option('--limit <n>', 'Max results', '100');
  listCmd.action(async () => {
    const opts = program.opts<GlobalOptions & { state?: string; limit?: string }>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      const prs = await client.listPRs(projectId, {
        state: opts.state,
        limit: opts.limit ? parseInt(opts.limit, 10) : undefined,
      });
      Output.list(prs, (pr) => Output.formatPR(pr), opts);
    }, opts);
  });

  // view
  const viewCmd = program.command('view <id>');
  viewCmd.description('View PR details');
  viewCmd.action(async (id: string) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      const pr = await client.getPR(projectId, parsePrId(id));
      Output.item(pr, (p) => Output.formatPR(p), opts);
    }, opts);
  });

  // review subcommands
  const reviewCmd = program.command('review');

  // review start
  const startCmd = reviewCmd.command('start <id>');
  startCmd.description('Start a review session');
  startCmd.action(async (id: string) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      const reviewId = await client.startReview(projectId, parsePrId(id));
      if (reviewId) {
        console.log(`Review started for PR #${id} (review ID: ${reviewId})`);
      } else {
        console.log(`Review started for PR #${id}`);
      }
    }, opts);
  });

  // review comment
  const commentCmd = reviewCmd.command('comment <id>');
  commentCmd.description('Add a comment to a PR (line-specific or general)');
  commentCmd.option('-f, --file <path>', 'File path');
  commentCmd.option('-l, --line <n>', 'Line number');
  commentCmd.option('-b, --body <text>', 'Comment body (use - for stdin, @path for file)');
  commentCmd.option('--body-file <path>', 'Read comment body from file');
  commentCmd.option('--side <side>', 'Side (new or old)', 'new');
  commentCmd.option('--severity <level>', 'Severity (blocker, issue, suggestion, nit)');
  commentCmd.action(
    async (
      id: string,
      options: {
        file?: string;
        line?: string;
        body?: string;
        bodyFile?: string;
        side?: string;
        severity?: string;
      },
    ) => {
      const opts = program.opts<GlobalOptions>();
      await runCommand(async () => {
        const config = await loadConfig({
          forge: opts.forge,
          project: opts.project,
          token: opts.token,
          baseUrl: opts.baseUrl,
        });
        const projectId = requireProject(config);
        const client = await createClient(config);

        let body: string | undefined;
        if (options.bodyFile) {
          body = await readBodyFromArg(`@${options.bodyFile}`);
        } else if (options.body) {
          body = await readBodyFromArg(options.body);
        }

        if (!body) {
          throw new UserError('Comment body is required. Use --body or --body-file.');
        }

        const severity = parseSeverity(options.severity);

        function parseSeverity(value: string | undefined): Severity | undefined {
          if (!value) return undefined;
          switch (value) {
            case 'blocker':
            case 'issue':
            case 'suggestion':
            case 'nit':
              return value;
            default:
              throw new UserError('Invalid severity. Use: blocker, issue, suggestion, or nit.');
          }
        }

        const isLineComment = options.file && options.line;
        const isGeneralComment = !options.file && !options.line;

        if (isGeneralComment && !body) {
          throw new UserError('Comment body is required for general comments.');
        }

        if (!isLineComment && !isGeneralComment) {
          throw new UserError(
            'Line comments require both --file and --line.\n' +
              'For general comments, omit --file and --line.\n' +
              'Example: gfreview review comment 4 --body "Overall feedback"',
          );
        }

        await client.addComment(projectId, parsePrId(id), {
          file: options.file,
          line: options.line ? parseInt(options.line, 10) : undefined,
          body,
          side: options.side === 'old' ? 'old' : 'new',
          severity,
        });

        if (isGeneralComment) {
          console.log('General comment added to PR #' + id);
        } else {
          console.log(`Comment added to ${options.file}:${options.line}`);
        }
      }, opts);
    },
  );

  // review submit
  const submitCmd = reviewCmd.command('submit <id>');
  submitCmd.description('Submit review');
  submitCmd.option('-b, --body <text>', 'Review summary (use - for stdin, @path for file)');
  submitCmd.action(async (id: string, options: { body?: string }) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      const summary = options.body ? await readBodyFromArg(options.body) : undefined;
      const service = new ReviewService(client, projectId, parsePrId(id));
      await service.submitReview(summary);
      console.log('Review submitted for PR #' + id);
    }, opts);
  });

  // review discard
  const discardCmd = reviewCmd.command('discard <id>');
  discardCmd.description('Discard pending review');
  discardCmd.action(async (id: string) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      const pendingReview = await client.getPendingReview(projectId, parsePrId(id));
      if (!pendingReview) {
        console.log('No pending review to discard for PR #' + id);
        return;
      }
      await client.discardReview(projectId, parsePrId(id));
      console.log('Pending review discarded for PR #' + id);
    }, opts);
  });

  // review status
  const statusCmd = reviewCmd.command('status <id>');
  statusCmd.description('Show review status and pending comments');
  statusCmd.action(async (id: string) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);

      const pendingReview = await client.getPendingReview(projectId, parsePrId(id));

      if (!pendingReview) {
        console.log(
          'No pending review for PR #' + id + '. Run "gfreview review start ' + id + '" to start.',
        );
        return;
      }

      console.log(`Pending review ID: ${pendingReview.id}`);
      console.log(`Started: ${pendingReview.submittedAt ?? 'unknown'}`);

      const comments = await client.listComments(projectId, parsePrId(id));

      if (comments.length === 0) {
        console.log('\nNo pending comments.');
        return;
      }

      const lineComments = comments.filter((c) => !c.isGeneralComment);
      const generalComments = comments.filter((c) => c.isGeneralComment);

      if (lineComments.length > 0) {
        console.log(`\nLine comments (${lineComments.length}):`);
        lineComments.forEach((c, i) => {
          console.log(`  [${i + 1}] ${c.file}:${c.line} (${c.side})`);
          console.log(`      ${c.body.substring(0, 80)}${c.body.length > 80 ? '...' : ''}`);
        });
      }

      if (generalComments.length > 0) {
        console.log(`\nGeneral comments (${generalComments.length}):`);
        generalComments.forEach((c, i) => {
          console.log(`  [${i + 1}] ${c.body.substring(0, 80)}${c.body.length > 80 ? '...' : ''}`);
        });
      }

      console.log(`\nRun "gfreview review submit ${id}" to submit this review.`);
    }, opts);
  });

  // review refresh
  const refreshCmd = reviewCmd.command('refresh <id>');
  refreshCmd.description('Refresh review status (check for updates)');
  refreshCmd.action(async (id: string) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      const pendingReview = await client.getPendingReview(projectId, parsePrId(id));
      if (!pendingReview) {
        console.log(
          'No pending review for PR #' + id + '. Run "gfreview review start ' + id + '" to start.',
        );
        return;
      }
      console.log('Review refreshed. Pending review ID: ' + pendingReview.id);
    }, opts);
  });

  // diff
  const diffCmd = program.command('diff <id>');
  diffCmd.description('Show PR diff with line numbers');
  diffCmd.action(async (id: string) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      const service = new DiffService(client, projectId, parsePrId(id));
      const diffs = await service.getDiff();
      console.log(service.formatForDisplay(diffs));
    }, opts);
  });

  // comments
  const commentsCmd = program.command('comments <id>');
  commentsCmd.description('List PR comments');
  commentsCmd.action(async (id: string) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      const service = new DiscussionService(client, projectId, parsePrId(id));
      const comments = await service.list();
      console.log(service.formatForDisplay(comments));
    }, opts);
  });

  // approve
  const approveCmd = program.command('approve <id>');
  approveCmd.description('Approve PR');
  approveCmd.action(async (id: string) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      await client.approvePR(projectId, parsePrId(id));
      console.log('PR #' + id + ' approved');
    }, opts);
  });

  // merge
  const mergeCmd = program.command('merge <id>');
  mergeCmd.description('Merge PR');
  mergeCmd.action(async (id: string) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      await client.mergePR(projectId, parsePrId(id));
      console.log('PR #' + id + ' merged');
    }, opts);
  });

  // create
  const createCmd = program.command('create');
  createCmd.description('Create a new PR');
  createCmd.requiredOption('-t, --title <title>', 'PR title');
  createCmd.requiredOption('-s, --source-branch <branch>', 'Source branch');
  createCmd.requiredOption('-b, --target-branch <branch>', 'Target branch');
  createCmd.option('-d, --description <text>', 'PR description');
  createCmd.option('--draft', 'Create as draft PR');
  createCmd.action(async (options) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      const pr = await client.createPR(projectId, {
        title: options.title,
        sourceBranch: options.sourceBranch,
        targetBranch: options.targetBranch,
        description: options.description,
        draft: options.draft,
      });
      console.log(`Created PR #${pr.iid}: ${pr.webUrl}`);
    }, opts);
  });

  // resolve
  const resolveCmd = program.command('resolve <id>');
  resolveCmd.description('Resolve a discussion');
  resolveCmd.requiredOption('-d, --discussion-id <id>', 'Discussion ID');
  resolveCmd.action(async (id: string, options: { discussionId: string }) => {
    const opts = program.opts<GlobalOptions>();
    await runCommand(async () => {
      const config = await loadConfig({
        forge: opts.forge,
        project: opts.project,
        token: opts.token,
        baseUrl: opts.baseUrl,
      });
      const projectId = requireProject(config);
      const client = await createClient(config);
      await client.resolveDiscussion(projectId, parsePrId(id), options.discussionId);
      console.log('Discussion resolved');
    }, opts);
  });

  return program;
}
