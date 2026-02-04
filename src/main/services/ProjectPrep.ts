import { promises as fs } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';

const pathExists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

async function pickNodeInstallCmd(target: string): Promise<string[]> {
  // Prefer package manager based on lockfile presence
  if (await pathExists(join(target, 'pnpm-lock.yaml'))) {
    return ['pnpm install --frozen-lockfile', 'pnpm install', 'npm ci', 'npm install'];
  }
  if (await pathExists(join(target, 'yarn.lock'))) {
    // Support modern Yarn (Berry) and classic Yarn
    return [
      'yarn install --immutable',
      'yarn install --frozen-lockfile',
      'yarn install',
      'npm ci',
      'npm install',
    ];
  }
  if (await pathExists(join(target, 'bun.lockb'))) {
    return ['bun install', 'npm ci', 'npm install'];
  }
  if (await pathExists(join(target, 'package-lock.json'))) {
    return ['npm ci', 'npm install'];
  }
  return ['npm install'];
}

function runInBackground(cmd: string | string[], cwd: string) {
  const command = Array.isArray(cmd) ? cmd.filter(Boolean).join(' || ') : cmd;
  const child = spawn(command, {
    cwd,
    shell: true,
    stdio: 'ignore',
    windowsHide: true,
    detached: process.platform !== 'win32',
  });
  // Avoid unhandled errors from bubbling; ignore failures silently
  child.on('error', () => {});
  child.unref?.();
}

/**
 * Best-effort dependency prep for common project types.
 * Non-blocking; spawns installs in background if needed.
 */
export async function ensureProjectPrepared(targetPath: string) {
  try {
    // Node projects: if package.json exists and node_modules missing, install deps
    const isNode = await pathExists(join(targetPath, 'package.json'));
    const hasNodeModules = await pathExists(join(targetPath, 'node_modules'));
    if (isNode && !hasNodeModules) {
      const cmds = await pickNodeInstallCmd(targetPath);
      runInBackground(cmds, targetPath);
    }

    // Optional: we could add Python prep here later if desired
  } catch {
    // ignore
  }
}
