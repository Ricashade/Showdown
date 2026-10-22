/**
 * Host-authoritative room protocol over a RoomChannel.
 *
 *   guest ──presence (name, public key)──▶ host     host seats lobby newcomers
 *   guest ──"action" {from, sealed move}──▶ host     host checks it's really them, runs applyAction
 *   host  ──"state" {sealed view per player}──▶ all  each guest can open only their own view
 *
 * Only the host ever holds the full GameState (hands of everyone + the shuffle seed).
 */
import type { BsPokerAction, BsPokerState } from "@/types/bs-poker";
import { applyAction, getPlayerView, MAX_PLAYERS, type BsPokerView } from "@/lib/bs-poker-game";
import type { PresenceMeta, RoomChannel } from "./channel";
import { deriveSharedKey, isSealed, open, seal, type Identity, type Sealed } from "./crypto";

export type SeatStatus = "seated" | "rejected" | "removed" | "closed";

/** What the host sends one guest (always sealed with that guest's key). */
export interface GuestEnvelope {
  seq: number;
  status: SeatStatus;
  view: BsPokerView | null;
  connectedIds: string[];
  /** Why a move or join didn't go through. */
  error?: string;
}

interface StateMessage {
  envelopes: Record<string, Sealed>;
}

interface ActionMessage {
  from: string;
  sealed: Sealed;
}

/** Inside a sealed action. `n` only ever increases, so recorded moves can't be replayed. */
interface SealedAction {
  n: number;
  action: BsPokerAction;
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

/** Everything a host needs to pick up again after a page refresh. */
export interface HostSnapshot {
  state: BsPokerState;
  seq: number;
  guestKeys: [string, string][];
  lastNonce: [string, number][];
  removed: string[];
}

export class RoomHost {
  private state: BsPokerState;
  private seq: number;
  /** playerId → their public key. First key seen wins; a later different key is an impostor. */
  private guestPublicKeys: Map<string, string>;
  private sharedKeys = new Map<string, CryptoKey>();
  private lastNonce: Map<string, number>;
  private removed: Set<string>;
  private connected = new Set<string>();
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private members: PresenceMeta[] = [];
  private closing = false;

  constructor(
    private channel: RoomChannel,
    private identity: Identity,
    private meta: PresenceMeta,
    initial: BsPokerState | HostSnapshot,
  ) {
    const snap = "state" in initial ? initial : null;
    this.state = snap ? snap.state : (initial as BsPokerState);
    this.seq = snap?.seq ?? 0;
    this.guestPublicKeys = new Map(snap?.guestKeys ?? []);
    this.lastNonce = new Map(snap?.lastNonce ?? []);
    this.removed = new Set(snap?.removed ?? []);
  }

  get hostId() {
    return this.state.hostId;
  }

  getState() {
    return this.state;
  }

  getConnectedIds(): string[] {
    return [this.hostId, ...this.connected];
  }

  /** Another host already holds this room code (the earlier one wins). */
  isRoomTaken(): boolean {
    return this.members.some(
      (m) => m.role === "host" && m.playerId !== this.hostId && m.joinedAt <= this.meta.joinedAt,
    );
  }

  snapshot(): HostSnapshot {
    return {
      state: this.state,
      seq: this.seq,
      guestKeys: [...this.guestPublicKeys],
      lastNonce: [...this.lastNonce],
      removed: [...this.removed],
    };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  async start() {
    this.channel.onPresence((members) => this.enqueue(() => this.onPresence(members)));
    this.channel.onMessage("action", (p) => this.enqueue(() => this.onAction(p)));
    // A guest that just (re)connected asks for the latest state.
    this.channel.onMessage("hello", () => this.enqueue(() => this.publish()));
    await this.channel.connect(this.meta);
  }

  async stop() {
    await this.channel.close();
  }

  /** Tell every guest the room is closed (sealed, so nobody else can fake it), then leave. */
  async close() {
    this.closing = true;
    await this.queue;
    await this.publish();
    await this.stop();
  }

  /** The host's own moves, applied immediately. */
  act(action: BsPokerAction) {
    const result = applyAction(this.state, action);
    if (result.ok) {
      this.state = result.state;
      this.notify();
      this.enqueue(() => this.publish());
    }
    return result;
  }

  /** Remove a guest from the lobby. They can't rejoin this room. */
  removePlayer(playerId: string) {
    if (playerId === this.hostId) return;
    this.removed.add(playerId);
    if (!this.act({ type: "LEAVE_ROOM", playerId }).ok) this.enqueue(() => this.publish());
  }

  private enqueue(task: () => Promise<void>) {
    this.queue = this.queue.then(task).catch((e) => console.error("[room host]", e));
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private apply(action: BsPokerAction): string | undefined {
    const result = applyAction(this.state, action);
    if (!result.ok) return result.error;
    this.state = result.state;
    return undefined;
  }

  private async onPresence(members: PresenceMeta[]) {
    this.members = members;
    const errors: Record<string, string> = {};
    /** playerId → the presence entry carrying that player's real key. */
    const connected = new Map<string, PresenceMeta>();

    for (const m of members) {
      if (m.role !== "guest" || m.playerId === this.hostId) continue;
      const known = this.guestPublicKeys.get(m.playerId);
      if (known && known !== m.publicKey) continue; // Someone else claiming this seat.
      if (!this.sharedKeys.has(m.playerId)) {
        this.guestPublicKeys.set(m.playerId, m.publicKey);
        this.sharedKeys.set(m.playerId, await deriveSharedKey(this.identity, m.publicKey));
      }
      connected.set(m.playerId, m);
    }
    this.connected = new Set(connected.keys());

    if (this.state.phase === "lobby") {
      // Seat newcomers…
      for (const [playerId, m] of connected) {
        const seated = this.state.players.some((p) => p.id === playerId);
        if (seated || this.removed.has(playerId)) continue;
        const error = this.apply({ type: "JOIN_ROOM", player: { id: playerId, name: m.name } });
        if (error) errors[playerId] = this.state.players.length >= MAX_PLAYERS ? "This table is full." : error;
      }
      // …and free the seats of anyone who left the lobby.
      for (const p of this.state.players) {
        if (p.id !== this.hostId && !this.connected.has(p.id)) this.apply({ type: "LEAVE_ROOM", playerId: p.id });
      }
    }
    this.notify();
    await this.publish(errors);
  }

  private async onAction(payload: unknown) {
    const msg = payload as ActionMessage;
    if (!msg || typeof msg.from !== "string" || !isSealed(msg.sealed)) return;
    const key = this.sharedKeys.get(msg.from);
    if (!key) return;
    let sealedAction: SealedAction;
    try {
      sealedAction = await open<SealedAction>(key, msg.sealed);
    } catch {
      return; // Not sealed with this player's key: forged or tampered.
    }
    if (!(sealedAction.n > (this.lastNonce.get(msg.from) ?? 0))) return; // Replay.
    this.lastNonce.set(msg.from, sealedAction.n);

    const { action } = sealedAction;
    if (this.removed.has(msg.from)) return;
    // Guests may only act as themselves; joining happens through presence.
    if (action.type === "JOIN_ROOM" || action.playerId !== msg.from) {
      await this.publish({ [msg.from]: "That move isn't yours to make." });
      return;
    }
    const error = this.apply(action);
    this.notify();
    await this.publish(error ? { [msg.from]: error } : undefined);
  }

  private async publish(errors: Record<string, string> = {}) {
    this.seq++;
    const connectedIds = this.getConnectedIds();
    const envelopes: Record<string, Sealed> = {};
    for (const [playerId, key] of this.sharedKeys) {
      const seated = this.state.players.some((p) => p.id === playerId);
      const status: SeatStatus = this.closing
        ? "closed"
        : this.removed.has(playerId)
          ? "removed"
          : seated
            ? "seated"
            : "rejected";
      const envelope: GuestEnvelope = {
        seq: this.seq,
        status,
        view: seated ? getPlayerView(this.state, playerId) : null,
        connectedIds,
        error:
          errors[playerId] ??
          (status === "rejected" && this.state.phase !== "lobby"
            ? "This game has already started. Ask the host to start a new one, then join again."
            : undefined),
      };
      envelopes[playerId] = await seal(key, envelope);
    }
    this.notify();
    if (Object.keys(envelopes).length) await this.channel.send("state", { envelopes } satisfies StateMessage);
  }
}

// ---------------------------------------------------------------------------
// Guest
// ---------------------------------------------------------------------------

export type GuestStatus =
  | "connecting"
  | "finding-host"
  | "waiting-for-seat"
  | "seated"
  | "rejected"
  | "removed"
  | "closed"
  | "host-away"
  | "not-found";

export interface GuestSnapshot {
  status: GuestStatus;
  view: BsPokerView | null;
  connectedIds: string[];
  /** Latest error from the host, with a counter so the same message can show twice. */
  error: { message: string; id: number } | null;
  hostName: string | null;
}

const NOT_FOUND_MS = 7000;

export class RoomGuest {
  private hostKey: CryptoKey | null = null;
  private hostPublicKey: string | null = null;
  private lastSeq = 0;
  private lastNonce = 0;
  private errorId = 0;
  private listeners = new Set<() => void>();
  private notFoundTimer: ReturnType<typeof setTimeout> | null = null;
  private snap: GuestSnapshot = { status: "connecting", view: null, connectedIds: [], error: null, hostName: null };

  constructor(
    private channel: RoomChannel,
    private identity: Identity,
    private meta: PresenceMeta,
  ) {}

  get playerId() {
    return this.meta.playerId;
  }

  getSnapshot() {
    return this.snap;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  async start() {
    this.channel.onPresence((m) => void this.onPresence(m));
    this.channel.onMessage("state", (p) => void this.onState(p));
    await this.channel.connect(this.meta);
    this.update({ status: this.snap.status === "connecting" ? "finding-host" : this.snap.status });
    this.notFoundTimer = setTimeout(() => {
      if (!this.hostKey) this.update({ status: "not-found" });
    }, NOT_FOUND_MS);
  }

  async stop() {
    if (this.notFoundTimer) clearTimeout(this.notFoundTimer);
    await this.channel.close();
  }

  /** Seal a move with our key and send it to the host. */
  async act(action: BsPokerAction) {
    if (!this.hostKey) return;
    // Wall-clock based so it keeps increasing across page refreshes.
    this.lastNonce = Math.max(this.lastNonce + 1, Date.now());
    const sealed = await seal(this.hostKey, { n: this.lastNonce, action } satisfies SealedAction);
    await this.channel.send("action", { from: this.meta.playerId, sealed } satisfies ActionMessage);
  }

  private update(patch: Partial<GuestSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private async onPresence(members: PresenceMeta[]) {
    // If two clients claim to host, trust the one that joined first.
    const host = members.filter((m) => m.role === "host").sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (this.snap.status === "closed" || this.snap.status === "removed") return;
    if (!host) {
      if (this.hostKey) this.update({ status: "host-away" });
      return;
    }
    const newHostKey = host.publicKey !== this.hostPublicKey;
    if (newHostKey) {
      this.hostPublicKey = host.publicKey;
      this.hostKey = await deriveSharedKey(this.identity, host.publicKey);
      this.lastSeq = 0; // Only changes if the host lost its saved session and started over.
    }
    const wasLooking = ["host-away", "finding-host", "not-found", "connecting"].includes(this.snap.status);
    if (wasLooking) this.update({ status: "waiting-for-seat", hostName: host.name });
    // Ask for the current state only when we've just found the host.
    if (newHostKey || wasLooking) await this.channel.send("hello", { from: this.meta.playerId });
  }

  private async onState(payload: unknown) {
    const sealed = (payload as StateMessage)?.envelopes?.[this.meta.playerId];
    if (!this.hostKey || !isSealed(sealed)) return;
    let env: GuestEnvelope;
    try {
      env = await open<GuestEnvelope>(this.hostKey, sealed);
    } catch {
      return;
    }
    if (env.seq <= this.lastSeq) return;
    this.lastSeq = env.seq;
    this.update({
      status: env.status === "seated" ? "seated" : env.status,
      view: env.view,
      connectedIds: env.connectedIds,
      ...(env.error ? { error: { message: env.error, id: ++this.errorId } } : {}),
    });
  }
}
