import { Command } from 'commander';

import type { Config } from '../entity/Schemas';

import { GitHubClient } from '../client/GitHubClient';
import { loadConfig } from '../Config';
import { UserError, ApiError, StaleReviewError, EXIT_CODES } from '../Errors';
import { DiffService } from '../service/DiffService';
import { DiscussionService } from '../service/DiscussionService';
import { ReviewService } from '../service/ReviewService';
import { Output } from './Output';

interface GlobalOptions {
  forge?: 'gitlab' | 'github';
  project?: string;
  token?: string;
  baseUrl?: string;
  json: boolean;
  verbose: boolean;
}

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
    .description('CLI for inline diff comments on GitHub PRs')
    .version('0.1.0');

  program
    .option('--forge <forge>', 'Forge to use (github or gitlab)')
    .option('-p, --project <id>', 'Project ID (owner/repo)')
    .option('--token <token>', 'API token (or use GITHUB_TOKEN/GITLAB_TOKEN env var)')
    .option('--base-url <url>', 'API base URL')
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
      await ReviewService.startReview({ client, projectId, mrIid: parsePrId(id) });
      console.log('Review started for PR #' + id);
    }, opts);
  });

  // review comment
  const commentCmd = reviewCmd.command('comment <id>');
  commentCmd.description('Add a comment to a PR line');
  commentCmd.requiredOption('-f, --file <path>', 'File path');
  commentCmd.requiredOption('-l, --line <n>', 'Line number');
  commentCmd.option('-b, --body <text>', 'Comment body');
  commentCmd.option('--side <side>', 'Side (new or old)', 'new');
  commentCmd.action(
    async (id: string, options: { file: string; line: string; body?: string; side?: string }) => {
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
        const side = options.side === 'old' ? 'old' : 'new';
        await ReviewService.addComment(
          { client, projectId, mrIid: parsePrId(id) },
          {
            file: options.file,
            line: parseInt(options.line, 10),
            body: options.body ?? '',
            side,
          },
        );
        console.log('Comment added');
      }, opts);
    },
  );

  // review submit
  const submitCmd = reviewCmd.command('submit <id>');
  submitCmd.description('Submit review');
  submitCmd.action(async (id: string) => {
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
      await ReviewService.submitReview({ client, projectId, mrIid: parsePrId(id) });
      console.log('Review submitted for PR #' + id);
    }, opts);
  });

  // review discard
  const discardCmd = reviewCmd.command('discard <id>');
  discardCmd.description('Discard review session');
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
      await ReviewService.discardReview({ client, projectId, mrIid: parsePrId(id) });
      console.log('Review discarded for PR #' + id);
    }, opts);
  });

  // review status
  const statusCmd = reviewCmd.command('status <id>');
  statusCmd.description('Show review status');
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
      const status = await ReviewService.getStatus({ client, projectId, mrIid: parsePrId(id) });

      if (!status.session) {
        console.log('No active review for PR #' + id);
        return;
      }

      if (status.isStale) {
        console.log(
          'PR has been updated since review started. Run "gfreview review refresh" to update.',
        );
      }
      console.log('Started: ' + status.session.startedAt);
      console.log('Comments: ' + status.comments.length);
    }, opts);
  });

  // review refresh
  const refreshCmd = reviewCmd.command('refresh <id>');
  refreshCmd.description('Refresh review to get latest diff');
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
      await ReviewService.refreshReview({ client, projectId, mrIid: parsePrId(id) });
      console.log('Review refreshed for PR #' + id);
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
      const diffs = await DiffService.getDiff({ client, projectId, mrIid: parsePrId(id) });
      console.log(DiffService.formatForDisplay(diffs));
    }, opts);
  });

  // discussions
  const discussionsCmd = program.command('discussions <id>');
  discussionsCmd.description('List PR discussions');
  discussionsCmd.action(async (id: string) => {
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
      const discussions = await DiscussionService.list({ client, projectId, mrIid: parsePrId(id) });
      console.log(DiscussionService.formatForDisplay(discussions));
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

  return program;
}
