/**
 * Transport seam between the UI and wherever the authoritative GameState lives.
 *
 * Phase 1: LocalTransport keeps state in memory (one browser = every player).
 * Later: a SupabaseTransport / PartyKitTransport implements the same interface —
 * `dispatch` POSTs the action to the authoritative reducer (API route or PartyKit
 * room running `applyAction`), and `subscribe` fires when a new redacted view
 * arrives over the realtime channel. The UI doesn't change.
 */
import type { ActionResult } from "@/types/game";

export interface GameTransport<S, A> {
  getSnapshot(): S;
  dispatch(action: A): ActionResult<S> | Promise<ActionResult<S>>;
  subscribe(listener: () => void): () => void;
}

export function createLocalTransport<S, A>(
  initial: S,
  reducer: (state: S, action: A) => ActionResult<S>,
): GameTransport<S, A> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    dispatch(action) {
      const result = reducer(state, action);
      if (result.ok) {
        state = result.state;
        listeners.forEach((l) => l());
      }
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
