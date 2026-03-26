import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

declare const VERSION: string | undefined;

function getVersionFromPackageJson(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

export function formatVersion(): string {
  const version = (typeof VERSION !== 'undefined' && VERSION)
    ? VERSION
    : getVersionFromPackageJson();
  const cleanVersion = version.replace(/^v/, '');
  return `gfreview v${cleanVersion}`;
}
