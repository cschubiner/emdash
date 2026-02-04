import { promises as fs } from 'fs';
import { dirname, join } from 'path';
import { app } from 'electron';

const CURRENT_DB_FILENAME = 'emdash.db';
const LEGACY_DB_FILENAMES = ['database.sqlite', 'orcbench.db'];

export interface ResolveDatabasePathOptions {
  userDataPath?: string;
}

const pathExists = async (p: string): Promise<boolean> => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

export async function resolveDatabasePath(
  options: ResolveDatabasePathOptions = {}
): Promise<string> {
  const userDataPath = options.userDataPath ?? app.getPath('userData');

  const currentPath = join(userDataPath, CURRENT_DB_FILENAME);
  if (await pathExists(currentPath)) {
    return currentPath;
  }

  // Dev safety: prior versions sometimes resolved userData under the default Electron app
  // (e.g. ~/Library/Application Support/Electron).
  try {
    const userDataParent = dirname(userDataPath);
    const legacyDirs = ['Electron', 'emdash', 'Emdash'];
    for (const dirName of legacyDirs) {
      const candidateDir = join(userDataParent, dirName);
      const candidateCurrent = join(candidateDir, CURRENT_DB_FILENAME);
      if (await pathExists(candidateCurrent)) {
        try {
          await fs.rename(candidateCurrent, currentPath);
          return currentPath;
        } catch {
          return candidateCurrent;
        }
      }
    }
  } catch {
    // best-effort only
  }

  for (const legacyName of LEGACY_DB_FILENAMES) {
    const legacyPath = join(userDataPath, legacyName);
    if (await pathExists(legacyPath)) {
      try {
        await fs.rename(legacyPath, currentPath);
        return currentPath;
      } catch {
        return legacyPath;
      }
    }
  }

  return currentPath;
}

export const databaseFilenames = {
  current: CURRENT_DB_FILENAME,
  legacy: [...LEGACY_DB_FILENAMES],
};

export async function resolveMigrationsPath(): Promise<string | null> {
  const appPath = app.getAppPath();
  const resourcesPath = process.resourcesPath ?? appPath;

  // Resolve symlinks to get actual paths (handles Homebrew, symlinks, etc.)
  const resolveRealPath = async (p: string): Promise<string | null> => {
    try {
      return await fs.realpath(p);
    } catch {
      return null;
    }
  };

  // Get the executable directory (handles more cases)
  const exePath = app.getPath('exe');
  const exeDir = dirname(exePath);

  const resolvedAppPath = await resolveRealPath(appPath);
  const candidates = [
    // Standard Electron paths
    join(appPath, 'drizzle'),
    join(appPath, '..', 'drizzle'),
    join(resourcesPath, 'drizzle'),

    // Handle ASAR unpacked
    join(resourcesPath, 'app.asar.unpacked', 'drizzle'),

    // Handle Homebrew and other symlinked installations
    ...(resolvedAppPath
      ? [join(resolvedAppPath, 'drizzle'), join(resolvedAppPath, '..', 'drizzle')]
      : []),

    // Handle macOS app bundle structure
    join(exeDir, '..', 'Resources', 'drizzle'),
    join(exeDir, '..', 'Resources', 'app', 'drizzle'),
    join(exeDir, '..', 'Resources', 'app.asar.unpacked', 'drizzle'),

    // Development paths
    join(process.cwd(), 'drizzle'),
    join(__dirname, '..', '..', '..', 'drizzle'),

    // Handle translocated apps on macOS
    ...(process.platform === 'darwin' && appPath.includes('AppTranslocation')
      ? [join(appPath.split('AppTranslocation')[0], 'drizzle')]
      : []),
  ];

  // Remove duplicates and try each candidate
  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

  for (const candidate of uniqueCandidates) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isDirectory()) continue;
      // Verify it's actually a directory with migration files
      const files = await fs.readdir(candidate);
      if (files.some((f: string) => f.endsWith('.sql'))) {
        console.log(`Found migrations at: ${candidate}`);
        return candidate;
      }
    } catch {
      // Not a valid directory, continue
    }
  }

  // Log diagnostic information to help debug
  console.error('Failed to find drizzle migrations folder. Searched paths:');
  console.error('- appPath:', appPath);
  console.error('- resourcesPath:', resourcesPath);
  console.error('- exeDir:', exeDir);
  console.error('- cwd:', process.cwd());
  console.error('- __dirname:', __dirname);
  console.error('- Candidates checked:', uniqueCandidates);

  return null;
}
