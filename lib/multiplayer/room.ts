/**
 * Host-authoritative room protocol over a RoomChannel.
 *
 *   guest ──presence (name, public key)──▶ host     host seats lobby newcomers
 *   guest ──"action" {from, sealed move}──▶ host     host checks it's really them, runs applyAction
 *   host  ──"state" {sealed view per player}──▶ all  each guest can open only their own view
 *   guest ──"chat" {from, sealed message}──▶ host    host checks the sender, stamps their name
 *   host  ──"chat" {sealed messages per player}──▶ all  new messages (or the history, on hello)
 *
 * Only the host ever holds the full GameState (hands of everyone + the shuffle seed).
 */
import type { ActionResult, PlayerSeed } from "@/types/game";
import { CHAT_HISTORY, CHAT_MIN_GAP_MS, cleanChat, isChatMessage, makeChat, mergeChat, type ChatMessage } from "@/lib/chat";
import type { PresenceMeta, RoomChannel } from "./channel";
import { deriveSharedKey, isSealed, open, seal, type Identity, type Sealed } from "./crypto";

/** The parts of a game's state the room needs. */
export interface RoomState {
  hostId: string;
  phase: string;
  /** Bots sit at the table without a connection of their own; the host plays for them. */
  players: { id: string; name?: string; isBot?: boolean }[];
}

/** Moves that act for a player carry their id in `playerId`. */
export type RoomAction = { type: string; playerId?: string };

/** A game the room can host: its rules, what each player may see, and how seats are taken. */
export interface GameDefinition<S extends RoomState, A extends RoomAction, V> {
  applyAction(state: S, action: A): ActionResult<S>;
  getPlayerView(state: S, playerId: string): V;
  join(player: PlayerSeed): A;
  leave(playerId: string): A;
  maxPlayers: number;
  /** Whether newcomers get a seat right now. Without it, only in the lobby. */
  seatsOpen?(state: S): boolean;
}

export type SeatStatus = "seated" | "rejected" | "removed" | "closed";

/** What the host sends one guest (always sealed with that guest's key). */
export interface GuestEnvelope<V> {
  seq: number;
  status: SeatStatus;
  view: V | null;
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
interface SealedAction<A> {
  n: number;
  action: A;
}

/** Inside a guest's sealed chat line; `n` shares the action counter. */
interface SealedChat {
  n: number;
  chat: { kind: unknown; text: unknown };
}

/** What the host sends one guest about chat (sealed with their key). */
interface ChatEnvelope {
  messages: ChatMessage[];
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

const isSnapshot = <S>(x: unknown): x is HostSnapshot<S> =>
  !!x && typeof x === "object" && "state" in x && "seq" in x && "guestKeys" in x;

/** Everything a host needs to pick up again after a page refresh. */
export interface HostSnapshot<S> {
  state: S;
  seq: number;
  guestKeys: [string, string][];
  lastNonce: [string, number][];
  removed: string[];
  chat?: ChatMessage[];
}

export class RoomHost<S extends RoomState, A extends RoomAction, V> {
  private state: S;
  private seq: number;
  /** playerId → their public key. First key seen wins; a later different key is an impostor. */
  private guestPublicKeys: Map<string, string>;
  private sharedKeys = new Map<string, CryptoKey>();
  private lastNonce: Map<string, number>;
  private removed: Set<string>;
  /** Connected guests: playerId → the presence entry carrying that player's real key. */
  private connected = new Map<string, PresenceMeta>();
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private members: PresenceMeta[] = [];
  private closing = false;
  private chat: ChatMessage[];
  private lastChatAt = new Map<string, number>();

  constructor(
    private game: GameDefinition<S, A, V>,
    private channel: RoomChannel,
    private identity: Identity,
    private meta: PresenceMeta,
    initial: S | HostSnapshot<S>,
  ) {
    const snap = isSnapshot(initial) ? initial : null;
    this.state = snap ? snap.state : (initial as S);
    this.seq = snap?.seq ?? 0;
    this.guestPublicKeys = new Map(snap?.guestKeys ?? []);
    this.lastNonce = new Map(snap?.lastNonce ?? []);
    this.removed = new Set(snap?.removed ?? []);
    this.chat = (snap?.chat ?? []).filter(isChatMessage).slice(-CHAT_HISTORY);
  }

  get hostId() {
    return this.state.hostId;
  }

  getState() {
    return this.state;
  }

  getConnectedIds(): string[] {
    const bots = this.state.players.filter((p) => p.isBot).map((p) => p.id);
    return [this.hostId, ...this.connected.keys(), ...bots];
  }

  /** Another host already holds this room code (the earlier one wins). */
  isRoomTaken(): boolean {
    return this.members.some(
      (m) => m.role === "host" && m.playerId !== this.hostId && m.joinedAt <= this.meta.joinedAt,
    );
  }

  snapshot(): HostSnapshot<S> {
    return {
      state: this.state,
      seq: this.seq,
      guestKeys: [...this.guestPublicKeys],
      lastNonce: [...this.lastNonce],
      removed: [...this.removed],
      chat: this.chat,
    };
  }

  getChat() {
    return this.chat;
  }

  /**
   * Post to the room chat as the host or one of the host's bots (a guest's line arrives through
   * `onChat`, already checked). Returns false if it isn't sendable.
   */
  post(senderId: string, kind: unknown, text: unknown): boolean {
    const clean = cleanChat(kind, text);
    if (!clean) return false;
    const sender = this.state.players.find((p) => p.id === senderId);
    if (senderId !== this.hostId && !sender?.isBot) return false;
    this.addChat(senderId, clean.kind, clean.text);
    return true;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  async start() {
    this.channel.onPresence((members) => this.enqueue(() => this.onPresence(members)));
    this.channel.onMessage("action", (p) => this.enqueue(() => this.onAction(p)));
    this.channel.onMessage("chat", (p) => this.enqueue(() => this.onChat(p)));
    // A guest that just (re)connected asks for the latest state, and the chat so far.
    this.channel.onMessage("hello", (p) =>
      this.enqueue(async () => {
        await this.publish();
        const from = (p as { from?: unknown } | null)?.from;
        if (typeof from === "string" && this.chat.length) await this.publishChat(this.chat, from);
      }),
    );
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
  act(action: A) {
    const before = this.state.phase;
    const result = this.game.applyAction(this.state, action);
    if (result.ok) {
      this.state = result.state;
      // Back in the lobby: seat whoever turned up meanwhile, free the seats of whoever left.
      if (before !== "lobby" && this.state.phase === "lobby") this.seatGuests({});
      this.notify();
      this.enqueue(() => this.publish());
    }
    return result;
  }

  /** Remove a guest from the lobby. They can't rejoin this room. */
  removePlayer(playerId: string) {
    if (playerId === this.hostId) return;
    this.removed.add(playerId);
    if (!this.act(this.game.leave(playerId)).ok) this.enqueue(() => this.publish());
  }

  private enqueue(task: () => Promise<void>) {
    this.queue = this.queue.then(task).catch((e) => console.error("[room host]", e));
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  private apply(action: A): string | undefined {
    const result = this.game.applyAction(this.state, action);
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
    this.connected = connected;
    this.seatGuests(errors);
    this.notify();
    await this.publish(errors);
  }

  /** Seat newcomers, and in the lobby free the seats of anyone who left. */
  private seatGuests(errors: Record<string, string>) {
    const open = this.game.seatsOpen?.(this.state) ?? this.state.phase === "lobby";
    if (open) {
      for (const [playerId, m] of this.connected) {
        if (this.state.players.some((p) => p.id === playerId) || this.removed.has(playerId)) continue;
        const error = this.apply(this.game.join({ id: playerId, name: m.name }));
        if (error) errors[playerId] = this.state.players.length >= this.game.maxPlayers ? "This table is full." : error;
      }
    }
    if (this.state.phase === "lobby") {
      for (const p of this.state.players) {
        if (p.id !== this.hostId && !p.isBot && !this.connected.has(p.id)) this.apply(this.game.leave(p.id));
      }
    }
  }

  private async onAction(payload: unknown) {
    const msg = payload as ActionMessage;
    if (!msg || typeof msg.from !== "string" || !isSealed(msg.sealed)) return;
    const key = this.sharedKeys.get(msg.from);
    if (!key) return;
    let sealedAction: SealedAction<A>;
    try {
      sealedAction = await open<SealedAction<A>>(key, msg.sealed);
    } catch {
      return; // Not sealed with this player's key: forged or tampered.
    }
    if (!(sealedAction.n > (this.lastNonce.get(msg.from) ?? 0))) return; // Replay.
    this.lastNonce.set(msg.from, sealedAction.n);

    const { action } = sealedAction;
    if (this.removed.has(msg.from)) return;
    // Guests may only act as themselves; joining (which has no playerId) happens through presence.
    if (typeof action?.playerId !== "string" || action.playerId !== msg.from) {
      await this.publish({ [msg.from]: "That move isn't yours to make." });
      return;
    }
    const error = this.apply(action);
    this.notify();
    await this.publish(error ? { [msg.from]: error } : undefined);
  }

  private async onChat(payload: unknown) {
    const msg = payload as ActionMessage;
    if (!msg || typeof msg.from !== "string" || !isSealed(msg.sealed)) return;
    const key = this.sharedKeys.get(msg.from);
    if (!key || this.removed.has(msg.from)) return;
    let sealedChat: SealedChat;
    try {
      sealedChat = await open<SealedChat>(key, msg.sealed);
    } catch {
      return; // Not sealed with this player's key.
    }
    if (!(sealedChat.n > (this.lastNonce.get(msg.from) ?? 0))) return; // Replay.
    this.lastNonce.set(msg.from, sealedChat.n);
    const clean = cleanChat(sealedChat.chat?.kind, sealedChat.chat?.text);
    if (!clean) return;
    // Only people actually in the room, and not faster than a person types.
    if (!this.state.players.some((p) => p.id === msg.from) && !this.connected.has(msg.from)) return;
    const now = Date.now();
    if (now - (this.lastChatAt.get(msg.from) ?? 0) < CHAT_MIN_GAP_MS) return;
    this.lastChatAt.set(msg.from, now);
    this.addChat(msg.from, clean.kind, clean.text);
  }

  /** Name the sender from the room's own records, keep it, and pass it on. */
  private addChat(senderId: string, kind: "chat" | "reaction", text: string) {
    const name = this.state.players.find((p) => p.id === senderId)?.name ?? this.connected.get(senderId)?.name ?? "Player";
    const message = makeChat(senderId, name, kind, text);
    this.chat = mergeChat(this.chat, [message]);
    this.notify();
    this.enqueue(() => this.publishChat([message]));
  }

  /** Seal chat messages for every guest (or just `onlyTo`). */
  private async publishChat(messages: ChatMessage[], onlyTo?: string) {
    const envelopes: Record<string, Sealed> = {};
    for (const [playerId, key] of this.sharedKeys) {
      if (this.removed.has(playerId) || (onlyTo && playerId !== onlyTo)) continue;
      envelopes[playerId] = await seal(key, { messages } satisfies ChatEnvelope);
    }
    if (Object.keys(envelopes).length) await this.channel.send("chat", { envelopes } satisfies StateMessage);
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
      const envelope: GuestEnvelope<V> = {
        seq: this.seq,
        status,
        view: seated ? this.game.getPlayerView(this.state, playerId) : null,
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

export interface GuestSnapshot<V> {
  status: GuestStatus;
  view: V | null;
  connectedIds: string[];
  /** Latest error from the host, with a counter so the same message can show twice. */
  error: { message: string; id: number } | null;
  hostName: string | null;
  chat: ChatMessage[];
}

const NOT_FOUND_MS = 7000;

export class RoomGuest<A extends RoomAction, V> {
  private hostKey: CryptoKey | null = null;
  private hostPublicKey: string | null = null;
  private lastSeq = 0;
  private lastNonce = 0;
  private errorId = 0;
  private listeners = new Set<() => void>();
  private notFoundTimer: ReturnType<typeof setTimeout> | null = null;
  private snap: GuestSnapshot<V> = { status: "connecting", view: null, connectedIds: [], error: null, hostName: null, chat: [] };

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
    this.channel.onMessage("chat", (p) => void this.onChat(p));
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
  async act(action: A) {
    if (!this.hostKey) return;
    const sealed = await seal(this.hostKey, { n: this.nextNonce(), action } satisfies SealedAction<A>);
    await this.channel.send("action", { from: this.meta.playerId, sealed } satisfies ActionMessage);
  }

  /** Say something in the room chat. It shows once the host has passed it on. */
  async say(kind: "chat" | "reaction", text: string) {
    if (!this.hostKey || !cleanChat(kind, text)) return;
    const sealed = await seal(this.hostKey, { n: this.nextNonce(), chat: { kind, text } } satisfies SealedChat);
    await this.channel.send("chat", { from: this.meta.playerId, sealed } satisfies ActionMessage);
  }

  /** Wall-clock based so it keeps increasing across page refreshes; shared by moves and chat. */
  private nextNonce() {
    this.lastNonce = Math.max(this.lastNonce + 1, Date.now());
    return this.lastNonce;
  }

  private async onChat(payload: unknown) {
    const sealed = (payload as StateMessage)?.envelopes?.[this.meta.playerId];
    if (!this.hostKey || !isSealed(sealed)) return;
    let env: ChatEnvelope;
    try {
      env = await open<ChatEnvelope>(this.hostKey, sealed);
    } catch {
      return;
    }
    if (Array.isArray(env?.messages)) this.update({ chat: mergeChat(this.snap.chat, env.messages) });
  }

  private update(patch: Partial<GuestSnapshot<V>>) {
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
    let env: GuestEnvelope<V>;
    try {
      env = await open<GuestEnvelope<V>>(this.hostKey, sealed);
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
