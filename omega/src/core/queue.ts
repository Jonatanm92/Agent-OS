import { assertTransition, TASK_TRANSITIONS } from './state.ts';
import type { RoleId, StateShape, Task } from './types.ts';
import { newId, nowIso } from './util.ts';

/**
 * Persistent mission task queue. Functions operate on a draft StateShape inside
 * Store.mutate(), so each queue operation is a single atomic write.
 */
export function enqueue(
  d: StateShape,
  missionId: string,
  role: RoleId,
  iteration = 1,
  input?: Record<string, unknown>,
  maxAttempts = 2,
): Task {
  const task: Task = {
    id: newId('task'),
    missionId,
    role,
    iteration,
    state: 'queued',
    attempts: 0,
    maxAttempts,
    createdAt: nowIso(),
    ...(input ? { input } : {}),
  };
  d.tasks.push(task);
  return task;
}

/** Claim the oldest queued task whose mission is running (FIFO). */
export function claimNext(d: StateShape): Task | undefined {
  const running = new Set(d.missions.filter((m) => m.state === 'running').map((m) => m.id));
  const task = d.tasks.find((t) => t.state === 'queued' && running.has(t.missionId));
  if (!task) return undefined;
  assertTransition('task', TASK_TRANSITIONS, task.state, 'running');
  task.state = 'running';
  task.attempts += 1;
  task.startedAt = nowIso();
  return task;
}

export function setTaskState(task: Task, to: Task['state'], error?: string): void {
  assertTransition('task', TASK_TRANSITIONS, task.state, to);
  task.state = to;
  if (to === 'succeeded' || to === 'failed') task.finishedAt = nowIso();
  if (error !== undefined) task.error = error;
}

/**
 * After a crash, tasks left "running" are re-queued if attempts remain, else failed.
 * Returns the tasks touched so the caller can audit them.
 */
export function recoverInterrupted(d: StateShape): { requeued: Task[]; failed: Task[] } {
  const requeued: Task[] = [];
  const failed: Task[] = [];
  for (const task of d.tasks.filter((t) => t.state === 'running')) {
    if (task.attempts < task.maxAttempts) {
      setTaskState(task, 'queued', 'interrupted (process stopped mid-task); re-queued');
      requeued.push(task);
    } else {
      setTaskState(task, 'failed', 'interrupted and no attempts left');
      failed.push(task);
    }
  }
  return { requeued, failed };
}

export function pendingCount(d: StateShape): number {
  return d.tasks.filter((t) => t.state === 'queued' || t.state === 'running').length;
}
