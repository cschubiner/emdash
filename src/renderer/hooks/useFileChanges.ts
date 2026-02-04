import { useCallback } from 'react';
import { refreshGitStatus, useGitStatus, type GitStatusChange } from '@/stores/gitStatusStore';

export type FileChange = GitStatusChange;

export interface FileChangesOptions {
  active?: boolean;
  pollIntervalMs?: number;
}

export function useFileChanges(taskPath: string, options?: FileChangesOptions) {
  const snapshot = useGitStatus(taskPath, {
    isActive: options?.active,
    pollIntervalMs: options?.pollIntervalMs,
  });

  const refreshChanges = useCallback(async () => {
    await refreshGitStatus(taskPath, true);
  }, [taskPath]);

  return {
    fileChanges: snapshot.changes,
    isLoading: snapshot.isLoading,
    error: snapshot.error ?? null,
    refreshChanges,
  };
}
