import { useGitStatus, type GitStatusChange } from '@/stores/gitStatusStore';

export type TaskChange = GitStatusChange;

export interface TaskChanges {
  taskId: string;
  changes: TaskChange[];
  totalAdditions: number;
  totalDeletions: number;
  isLoading: boolean;
  error?: string;
}

export interface TaskChangesOptions {
  active?: boolean;
  pollIntervalMs?: number;
}

export function useTaskChanges(taskPath: string, taskId: string, options?: TaskChangesOptions) {
  const snapshot = useGitStatus(taskPath, {
    isActive: options?.active,
    pollIntervalMs: options?.pollIntervalMs,
  });

  const totalAdditions = snapshot.changes.reduce((sum, change) => sum + change.additions, 0);
  const totalDeletions = snapshot.changes.reduce((sum, change) => sum + change.deletions, 0);

  return {
    taskId,
    changes: snapshot.changes,
    totalAdditions,
    totalDeletions,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
  };
}
