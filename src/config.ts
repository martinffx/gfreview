import { $ } from 'bun';

import type { Config } from './entity/schemas';

import { ConfigSchema } from './entity/schemas';
import { UserError } from './errors';

const GITLAB_DEFAULT_URL = 'https://gitlab.com';
const GITHUB_DEFAULT_URL = 'https://api.github.com';

export async function loadConfig(options?: Partial<Config>): Promise<Config> {
  const forge = options?.forge ?? (process.env.GITLAB_TOKEN ? 'gitlab' : 'github');

  const token =
    options?.token ?? (forge === 'gitlab' ? process.env.GITLAB_TOKEN : process.env.GITHUB_TOKEN);

  if (!token) {
    throw new UserError(
      `No ${forge === 'gitlab' ? 'GITLAB_TOKEN' : 'GITHUB_TOKEN'} environment variable found. ` +
        'Set it or use --token flag.',
    );
  }

  const baseUrl =
    options?.baseUrl ??
    (forge === 'gitlab' ? (process.env.GITLAB_URL ?? GITLAB_DEFAULT_URL) : GITHUB_DEFAULT_URL);

  const project = options?.project ?? (await detectProject(forge));

  return ConfigSchema.parse({
    forge,
    token,
    baseUrl,
    project,
  });
}

export async function detectProject(forge: 'gitlab' | 'github'): Promise<string | undefined> {
  try {
    const result = await $`git remote get-url origin`.quiet();
    const remoteUrl = result.text().trim();

    return parseProjectFromRemote(remoteUrl, forge);
  } catch {
    return undefined;
  }
}

function parseProjectFromRemote(url: string, forge: 'gitlab' | 'github'): string | undefined {
  const patterns =
    forge === 'gitlab'
      ? [/gitlab\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/, /gitlab\.[^/]+[/:]([^/]+\/[^/]+?)(?:\.git)?$/]
      : [
          /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/,
          /github\.[^/]+[/:]([^/]+\/[^/]+?)(?:\.git)?$/,
        ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}
