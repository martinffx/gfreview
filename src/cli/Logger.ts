export type LogScope = 'config' | 'api' | 'review' | 'diff';

let verbose = false;

export const Logger = {
  setVerbose(v: boolean): void {
    verbose = v;
  },

  debug(scope: LogScope, message: string, data?: Record<string, unknown>): void {
    if (!verbose) return;
    const timestamp = new Date().toISOString().split('T')[1]?.slice(0, 8) ?? '00:00:00';
    const prefix = `\x1b[90m[${timestamp}] debug:${scope}\x1b[0m`;
    if (data) {
      console.error(prefix, message, data);
    } else {
      console.error(prefix, message);
    }
  },

  debugResponse(scope: LogScope, method: string, path: string, status: number): void {
    if (!verbose) return;
    const timestamp = new Date().toISOString().split('T')[1]?.slice(0, 8) ?? '00:00:00';
    const prefix = `\x1b[90m[${timestamp}] debug:${scope}\x1b[0m`;
    console.error(prefix, `${method} ${path} → ${status}`);
  },
};
