import { useCallback, useSyncExternalStore } from 'react';
import { subscribeToFileChanges } from '@/lib/fileChangeEvents';

export type GitStatusChange = {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  isStaged: boolean;
  diff?: string;
};

export type GitStatusSnapshot = {
  workspacePath: string;
  changes: GitStatusChange[];
  isLoading: boolean;
  error?: string;
  lastUpdated?: number;
};

export type GitStatusSubscribeOptions = {
  isActive?: boolean;
  pollIntervalMs?: number;
};

export type GitStatusSubscription = {
  unsubscribe: () => void;
  setActive: (isActive: boolean) => void;
  setPollIntervalMs: (pollIntervalMs: number) => void;
  refresh: () => Promise<void>;
};

type SubscriberRecord = {
  id: number;
  callback: (snapshot: GitStatusSnapshot) => void;
  isActive: boolean;
  pollIntervalMs: number;
};

type GitStatusEntry = {
  workspacePath: string;
  snapshot: GitStatusSnapshot;
  subscribers: Map<number, SubscriberRecord>;
  timerId?: ReturnType<typeof setInterval>;
  pollIntervalMs?: number;
  inFlight: boolean;
  pendingFetch: boolean;
  lastFetchAt?: number;
};

const entries = new Map<string, GitStatusEntry>();
let nextSubscriberId = 1;
let visibilityListenerAttached = false;
let fileChangeListenerAttached = false;
let documentVisible =
  typeof document === 'undefined' ? true : document.visibilityState !== 'hidden';

const DEFAULT_POLL_INTERVAL_MS = 20000;

const isExcludedPath = (path: string) => path.startsWith('.emdash/') || path === 'PLANNING.md';

const createEmptySnapshot = (workspacePath: string): GitStatusSnapshot => ({
  workspacePath,
  changes: [],
  isLoading: false,
});

const notifySubscribers = (entry: GitStatusEntry) => {
  entry.subscribers.forEach((subscriber) => {
    subscriber.callback(entry.snapshot);
  });
};

const computeActiveInterval = (entry: GitStatusEntry): number | undefined => {
  let minInterval: number | undefined;
  entry.subscribers.forEach((subscriber) => {
    if (!subscriber.isActive) return;
    if (minInterval === undefined || subscriber.pollIntervalMs < minInterval) {
      minInterval = subscriber.pollIntervalMs;
    }
  });
  return minInterval;
};

const stopPolling = (entry: GitStatusEntry) => {
  if (entry.timerId) {
    clearInterval(entry.timerId);
    entry.timerId = undefined;
  }
  entry.pollIntervalMs = undefined;
};

const shouldPoll = (entry: GitStatusEntry) =>
  documentVisible && computeActiveInterval(entry) !== undefined;

const normalizeChanges = (changes: Array<any>) =>
  changes
    .filter((change) => !isExcludedPath(change.path))
    .map((change) => ({
      path: change.path,
      status: change.status,
      additions: change.additions ?? 0,
      deletions: change.deletions ?? 0,
      isStaged: change.isStaged ?? false,
      diff: change.diff,
    }));

const fetchAndNotify = async (
  entry: GitStatusEntry,
  options?: { showLoading?: boolean }
) => {
  if (entry.inFlight) {
    entry.pendingFetch = true;
    return;
  }

  entry.inFlight = true;
  if (options?.showLoading) {
    entry.snapshot = {
      ...entry.snapshot,
      isLoading: true,
      error: undefined,
    };
    notifySubscribers(entry);
  }

  try {
    const result = await window.electronAPI.getGitStatus(entry.workspacePath);

    if (result?.success && Array.isArray(result.changes)) {
      const changes = normalizeChanges(result.changes);

      entry.snapshot = {
        workspacePath: entry.workspacePath,
        changes,
        isLoading: false,
        error: undefined,
        lastUpdated: Date.now(),
      };
      entry.lastFetchAt = Date.now();
    } else {
      entry.snapshot = {
        workspacePath: entry.workspacePath,
        changes: [],
        isLoading: false,
        error: result?.error || 'Failed to fetch git status',
        lastUpdated: Date.now(),
      };
      entry.lastFetchAt = Date.now();
    }
  } catch (error) {
    console.error('Failed to fetch git status:', error);
    entry.snapshot = {
      workspacePath: entry.workspacePath,
      changes: [],
      isLoading: false,
      error: error instanceof Error ? error.message : String(error),
      lastUpdated: Date.now(),
    };
    entry.lastFetchAt = Date.now();
  } finally {
    entry.inFlight = false;
    notifySubscribers(entry);

    if (entry.pendingFetch) {
      entry.pendingFetch = false;
      if (shouldPoll(entry)) {
        void fetchAndNotify(entry, { showLoading: false });
      }
    }
  }
};

const updatePolling = (entry: GitStatusEntry) => {
  const nextInterval = computeActiveInterval(entry);
  const shouldBePolling = documentVisible && nextInterval !== undefined;
  const wasPolling = entry.timerId !== undefined;

  if (!shouldBePolling) {
    stopPolling(entry);
    if (documentVisible && entry.subscribers.size > 0 && entry.lastFetchAt === undefined) {
      void fetchAndNotify(entry, { showLoading: true });
    }
    return;
  }

  if (!wasPolling || entry.pollIntervalMs !== nextInterval) {
    stopPolling(entry);
    entry.pollIntervalMs = nextInterval;
    entry.timerId = setInterval(() => {
      void fetchAndNotify(entry, { showLoading: false });
    }, nextInterval);
  }

  if (!wasPolling) {
    void fetchAndNotify(entry, { showLoading: entry.lastFetchAt === undefined });
  }
};

const ensureVisibilityListener = () => {
  if (visibilityListenerAttached || typeof document === 'undefined') {
    return;
  }

  visibilityListenerAttached = true;
  document.addEventListener('visibilitychange', () => {
    documentVisible = document.visibilityState !== 'hidden';
    entries.forEach((entry) => updatePolling(entry));
  });
};

const ensureFileChangeListener = () => {
  if (fileChangeListenerAttached || typeof window === 'undefined') {
    return;
  }

  fileChangeListenerAttached = true;
  subscribeToFileChanges((event) => {
    if (!documentVisible) return;
    const taskPath = event.detail?.taskPath;
    if (!taskPath) return;
    const entry = entries.get(taskPath);
    if (!entry) return;
    void fetchAndNotify(entry, { showLoading: false });
  });
};

const getOrCreateEntry = (workspacePath: string): GitStatusEntry => {
  const existing = entries.get(workspacePath);
  if (existing) return existing;

  const entry: GitStatusEntry = {
    workspacePath,
    snapshot: createEmptySnapshot(workspacePath),
    subscribers: new Map(),
    inFlight: false,
    pendingFetch: false,
  };

  entries.set(workspacePath, entry);
  return entry;
};

export const getGitStatusSnapshot = (workspacePath: string): GitStatusSnapshot => {
  if (!workspacePath) {
    return createEmptySnapshot('');
  }
  return entries.get(workspacePath)?.snapshot ?? createEmptySnapshot(workspacePath);
};

export const refreshGitStatus = async (workspacePath: string, showLoading = true) => {
  if (!workspacePath) return;
  const entry = entries.get(workspacePath) ?? getOrCreateEntry(workspacePath);
  await fetchAndNotify(entry, { showLoading });
};

export const subscribeToGitStatus = (
  workspacePath: string,
  callback: (snapshot: GitStatusSnapshot) => void,
  options?: GitStatusSubscribeOptions
): GitStatusSubscription => {
  if (!workspacePath) {
    return {
      unsubscribe: () => {},
      setActive: () => {},
      setPollIntervalMs: () => {},
      refresh: async () => {},
    };
  }

  ensureVisibilityListener();
  ensureFileChangeListener();

  const entry = getOrCreateEntry(workspacePath);
  const id = nextSubscriberId++;
  const subscriber: SubscriberRecord = {
    id,
    callback,
    isActive: options?.isActive ?? true,
    pollIntervalMs: options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  };

  entry.subscribers.set(id, subscriber);
  callback(entry.snapshot);
  updatePolling(entry);

  const unsubscribe = () => {
    const currentEntry = entries.get(workspacePath);
    if (!currentEntry) return;
    currentEntry.subscribers.delete(id);

    if (currentEntry.subscribers.size === 0) {
      stopPolling(currentEntry);
      entries.delete(workspacePath);
      return;
    }

    updatePolling(currentEntry);
  };

  const setActive = (isActive: boolean) => {
    const currentEntry = entries.get(workspacePath);
    if (!currentEntry) return;
    const record = currentEntry.subscribers.get(id);
    if (!record || record.isActive === isActive) return;
    record.isActive = isActive;
    updatePolling(currentEntry);
  };

  const setPollIntervalMs = (pollIntervalMs: number) => {
    const currentEntry = entries.get(workspacePath);
    if (!currentEntry) return;
    const record = currentEntry.subscribers.get(id);
    if (!record || record.pollIntervalMs === pollIntervalMs) return;
    record.pollIntervalMs = pollIntervalMs;
    updatePolling(currentEntry);
  };

  const refresh = async () => {
    const currentEntry = entries.get(workspacePath);
    if (!currentEntry) return;
    await fetchAndNotify(currentEntry, { showLoading: true });
  };

  return {
    unsubscribe,
    setActive,
    setPollIntervalMs,
    refresh,
  };
};

export const gitStatusStore = {
  getGitStatusSnapshot,
  subscribeToGitStatus,
  refreshGitStatus,
};

export const useGitStatus = (workspacePath: string, options?: GitStatusSubscribeOptions) => {
  const subscribe = useCallback(
    (listener: () => void) => {
      const subscription = subscribeToGitStatus(workspacePath, () => listener(), options);
      return () => subscription.unsubscribe();
    },
    [workspacePath, options?.isActive, options?.pollIntervalMs]
  );

  const getSnapshot = useCallback(
    () => getGitStatusSnapshot(workspacePath),
    [workspacePath]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export { createEmptySnapshot };
