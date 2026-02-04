import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

function isWindows() {
  return process.platform === 'win32';
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

type Entry = { p: string; m: number };

async function collectPaths(root: string): Promise<string[]> {
  const result: string[] = [];
  const stack = ['.'];
  let steps = 0;
  while (stack.length) {
    const rel = stack.pop()!;
    const abs = path.join(root, rel);
    let st: fs.Stats;
    try {
      st = await fs.promises.lstat(abs);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      // Skip our internal folder so we can write logs/policies
      if (rel === '.emdash' || rel.startsWith('.emdash' + path.sep)) continue;
      result.push(rel);
      let entries: string[] = [];
      try {
        entries = await fs.promises.readdir(abs);
      } catch {
        continue;
      }
      for (const e of entries) {
        const nextRel = rel === '.' ? e : path.join(rel, e);
        stack.push(nextRel);
      }
    } else if (st.isFile()) {
      result.push(rel);
    }
    steps += 1;
    if (steps % 100 === 0) {
      await yieldToEventLoop();
    }
  }
  return result;
}

function chmodNoWrite(mode: number, isDir: boolean): number {
  const noWrite = mode & ~0o222; // clear write bits
  if (isDir) {
    // Ensure traverse bits present
    return (noWrite | 0o111) & 0o7777;
  }
  return noWrite & 0o7777;
}

async function applyLock(
  root: string
): Promise<{ success: boolean; changed: number; error?: string }> {
  try {
    const entries = await collectPaths(root);
    const state: Entry[] = [];
    let changed = 0;
    let steps = 0;
    for (const rel of entries) {
      const abs = path.join(root, rel);
      let st: fs.Stats;
      try {
        st = await fs.promises.stat(abs);
      } catch {
        continue;
      }
      const isDir = st.isDirectory();
      const prevMode = st.mode & 0o7777;
      const nextMode = chmodNoWrite(prevMode, isDir);
      if (nextMode !== prevMode) {
        try {
          await fs.promises.chmod(abs, nextMode);
          state.push({ p: rel, m: prevMode });
          changed++;
        } catch {}
      }
      steps += 1;
      if (steps % 100 === 0) {
        await yieldToEventLoop();
      }
    }
    // Persist lock state
    const baseDir = path.join(root, '.emdash');
    try {
      await fs.promises.mkdir(baseDir, { recursive: true });
    } catch {}
    const statePath = path.join(baseDir, '.planlock.json');
    try {
      await fs.promises.writeFile(statePath, JSON.stringify(state), 'utf8');
    } catch {}
    return { success: true, changed };
  } catch (e: any) {
    return { success: false, changed: 0, error: e?.message || String(e) };
  }
}

async function releaseLock(
  root: string
): Promise<{ success: boolean; restored: number; error?: string }> {
  try {
    const statePath = path.join(root, '.emdash', '.planlock.json');
    try {
      await fs.promises.access(statePath);
    } catch {
      return { success: true, restored: 0 };
    }
    let raw = '';
    try {
      raw = await fs.promises.readFile(statePath, 'utf8');
    } catch {}
    let entries: Entry[] = [];
    try {
      entries = JSON.parse(raw || '[]');
    } catch {}
    let restored = 0;
    for (const ent of entries) {
      try {
        const abs = path.join(root, ent.p);
        await fs.promises.chmod(abs, ent.m);
        restored++;
      } catch {}
    }
    // Cleanup state file
    try {
      await fs.promises.unlink(statePath);
    } catch {}
    return { success: true, restored };
  } catch (e: any) {
    return { success: false, restored: 0, error: e?.message || String(e) };
  }
}

export function registerPlanLockIpc(): void {
  ipcMain.handle('plan:lock', async (_e, taskPath: string) => {
    if (isWindows()) {
      // Best-effort: still attempt chmod; ACL hardening could be added with icacls in a future pass
      return applyLock(taskPath);
    }
    return applyLock(taskPath);
  });

  ipcMain.handle('plan:unlock', async (_e, taskPath: string) => {
    if (isWindows()) {
      return releaseLock(taskPath);
    }
    return releaseLock(taskPath);
  });
}
