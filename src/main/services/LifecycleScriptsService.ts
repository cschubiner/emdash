import fs from 'fs';
import path from 'path';
import { log } from '../lib/logger';

export interface EmdashScripts {
  setup?: string;
}

export interface EmdashConfig {
  preservePatterns?: string[];
  scripts?: EmdashScripts;
}

/**
 * Manages lifecycle scripts for worktrees.
 * Scripts are configured in .emdash.json at the project root.
 */
class LifecycleScriptsService {
  /**
   * Read .emdash.json config from project root
   */
  async readConfig(projectPath: string): Promise<EmdashConfig | null> {
    try {
      const configPath = path.join(projectPath, '.emdash.json');
      try {
        await fs.promises.access(configPath);
      } catch {
        return null;
      }
      const content = await fs.promises.readFile(configPath, 'utf8');
      return JSON.parse(content) as EmdashConfig;
    } catch (error) {
      log.warn('Failed to read .emdash.json', { projectPath, error });
      return null;
    }
  }

  /**
   * Get the setup script command if configured
   */
  async getSetupScript(projectPath: string): Promise<string | null> {
    const config = await this.readConfig(projectPath);
    return config?.scripts?.setup || null;
  }
}

export const lifecycleScriptsService = new LifecycleScriptsService();
