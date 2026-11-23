import type { ApprovalState, MissionState, TaskState } from './types.ts';

/**
 * Explicit state machines. Every state change in OMEGA goes through assertTransition,
 * so an illegal jump (e.g. "failed" → "approved") is a programming error that throws
 * instead of silently corrupting a mission.
 */
export const MISSION_TRANSITIONS: Record<MissionState, readonly MissionState[]> = {
  received: ['running', 'blocked', 'cancelled', 'failed'],
  blocked: ['running', 'failed', 'cancelled'],
  running: ['blocked', 'awaiting_review', 'failed', 'cancelled'],
  awaiting_review: ['approved', 'rejected'],
  approved: [],
  rejected: [],
  failed: ['running', 'cancelled'], // manual retry
  cancelled: [],
};

export const TASK_TRANSITIONS: Record<TaskState, readonly TaskState[]> = {
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'queued'], // queued = crash recovery / retry
  succeeded: [],
  failed: ['queued'], // manual retry
  cancelled: [],
};

export const APPROVAL_TRANSITIONS: Record<ApprovalState, readonly ApprovalState[]> = {
  pending: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export class TransitionError extends Error {}

export function canTransition<S extends string>(table: Record<S, readonly S[]>, from: S, to: S): boolean {
  return table[from]?.includes(to) ?? false;
}

export function assertTransition<S extends string>(kind: string, table: Record<S, readonly S[]>, from: S, to: S): void {
  if (!canTransition(table, from, to)) {
    throw new TransitionError(`Illegal ${kind} transition: ${from} → ${to}`);
  }
}

export const TERMINAL_MISSION_STATES: readonly MissionState[] = ['approved', 'rejected', 'cancelled'];
