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
    active: options?.active,
    pollIntervalMs: options?.pollIntervalMs,
  });

  return {
    taskId,
    changes: snapshot.changes,
    totalAdditions: snapshot.totalAdditions,
    totalDeletions: snapshot.totalDeletions,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
  };
}
