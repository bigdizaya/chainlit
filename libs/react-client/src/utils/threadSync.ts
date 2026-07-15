import { IStep, IThread } from '../types';

type ThreadFetcher = (threadId: string) => Promise<IThread | null | undefined>;

export function isCurrentThreadSnapshot(
  requestedThreadId: string,
  activeThreadId: string | undefined,
  snapshot: IThread | null | undefined
): snapshot is IThread {
  return Boolean(
    snapshot?.id === requestedThreadId && activeThreadId === requestedThreadId
  );
}

export function mergeThreadSteps(snapshot: IStep[], current: IStep[]) {
  const currentById = new Map(current.map((step) => [step.id, step]));
  const snapshotIds = new Set(snapshot.map((step) => step.id));

  const mergedSnapshot = snapshot.map((persistedStep) => {
    const liveStep = currentById.get(persistedStep.id);
    if (!liveStep) return persistedStep;

    const persistedOutput = String(persistedStep.output || '');
    const liveOutput = String(liveStep.output || '');
    return liveOutput.length > persistedOutput.length
      ? liveStep
      : persistedStep;
  });

  return [
    ...mergedSnapshot,
    ...current.filter((step) => !snapshotIds.has(step.id))
  ];
}

export async function fetchThreadWithRetry(
  fetchThread: ThreadFetcher,
  threadId: string,
  retryDelaysMs = [0, 300, 900]
) {
  let lastError: unknown;

  for (const delay of retryDelaysMs) {
    if (delay > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    }
    try {
      const thread = await fetchThread(threadId);
      if (thread) return thread;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return undefined;
}
