import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

import type { ReviewSession } from '../entity/Schemas';

const SESSION_DIR = join(homedir(), '.config', 'gfreview', 'sessions');

function isReviewSession(obj: unknown): obj is ReviewSession {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'projectId' in obj &&
    'mrIid' in obj
  );
}

function getSessionPath(projectId: string, mrIid: number): string {
  const safeId = projectId.replace(/\//g, '_');
  return join(SESSION_DIR, `${safeId}!${mrIid}.json`);
}

async function ensureSessionDir(): Promise<void> {
  try {
    await mkdir(SESSION_DIR, { recursive: true });
  } catch {
    // Directory exists
  }
}

export const SessionStore = {
  async read(projectId: string, mrIid: number): Promise<ReviewSession | null> {
    try {
      const path = getSessionPath(projectId, mrIid);
      const content = await readFile(path, 'utf-8');
      const parsed = JSON.parse(content);
      if (!isReviewSession(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  async write(projectId: string, mrIid: number, session: ReviewSession): Promise<void> {
    await ensureSessionDir();
    const path = getSessionPath(projectId, mrIid);
    await writeFile(path, JSON.stringify(session, null, 2));
  },

  async delete(projectId: string, mrIid: number): Promise<void> {
    try {
      const path = getSessionPath(projectId, mrIid);
      await unlink(path);
    } catch {
      // File doesn't exist
    }
  },

  async exists(projectId: string, mrIid: number): Promise<boolean> {
    const session = await this.read(projectId, mrIid);
    return session !== null;
  },
};
