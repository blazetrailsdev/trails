/**
 * ActionDispatch::Request::Session
 *
 * Wraps a session store and provides a Hash-like interface for session data.
 * Supports lazy loading, destruction, and tracking of the original session id.
 */

export interface SessionStore {
  loadSession(env: Record<string, unknown>): [unknown, Record<string, unknown>];
  sessionExists(env: Record<string, unknown>): boolean;
  deleteSession(
    env: Record<string, unknown>,
    id: unknown,
    options: Record<string, unknown>,
  ): unknown;
}

const ENV_SESSION_KEY = "rack.session";
const ENV_SESSION_OPTIONS_KEY = "rack.session.options";

export class Session {
  private store: SessionStore;
  private env: Record<string, unknown>;
  private options: Record<string, unknown>;
  private data: Record<string, unknown> | null = null;
  private loaded = false;
  private id: unknown = null;
  private _idWas: unknown = null;
  private existed: boolean;
  private destroyed = false;

  private constructor(
    store: SessionStore,
    env: Record<string, unknown>,
    options: Record<string, unknown>,
  ) {
    this.store = store;
    this.env = env;
    this.options = options;
    this.existed = store.sessionExists(env);
    if (this.existed) {
      const [sessionId, data] = store.loadSession(env);
      this._idWas = sessionId;
      this.id = sessionId;
      this.data = { ...data };
      this.loaded = true;
    }
  }

  static create(
    store: SessionStore,
    req: { env: Record<string, unknown> },
    options: Record<string, unknown> = {},
  ): Session {
    const existing = req.env[ENV_SESSION_KEY] as Session | undefined;
    req.env[ENV_SESSION_OPTIONS_KEY] = options;
    const session = new Session(store, req.env, options);

    if (existing && existing instanceof Session) {
      const oldData = existing.toHash();
      session.loadData();
      for (const [key, value] of Object.entries(oldData)) {
        if (!(key in session.getData())) {
          session.getData()[key] = value;
        }
      }
    }

    req.env[ENV_SESSION_KEY] = session;
    return session;
  }

  static find(req: { env: Record<string, unknown> }): Session | null {
    const session = req.env[ENV_SESSION_KEY];
    if (session instanceof Session) return session;
    return null;
  }

  private loadData(): void {
    if (!this.loaded && !this.destroyed) {
      const [sessionId, data] = this.store.loadSession(this.env);
      this.id = sessionId;
      this.data = { ...data };
      this.loaded = true;
    }
  }

  private getData(): Record<string, unknown> {
    this.loadData();
    return this.data!;
  }

  get(key: string): unknown {
    return this.getData()[key];
  }

  set(key: string, value: unknown): void {
    this.getData()[key] = value;
  }

  store_value(key: string, value: unknown): void {
    this.set(key, value);
  }

  get keys(): string[] {
    return Object.keys(this.getData());
  }

  get values(): unknown[] {
    return Object.values(this.getData());
  }

  clear(): void {
    this.loadData();
    this.data = {};
  }

  update(hash: Record<string, unknown>): void {
    const data = this.getData();
    for (const [key, value] of Object.entries(hash)) {
      data[key] = value;
    }
  }

  delete(key: string): unknown {
    const data = this.getData();
    const value = data[key];
    delete data[key];
    return value;
  }

  fetch(key: string, ...args: unknown[]): unknown {
    const data = this.getData();
    if (key in data) return data[key];
    if (args.length > 0) {
      if (typeof args[0] === "function") {
        return (args[0] as (key: string) => unknown)(key);
      }
      return args[0];
    }
    throw new Error(`key not found: "${key}"`);
  }

  dig(...keys: string[]): unknown {
    let current: unknown = this.getData();
    for (const key of keys) {
      if (current == null || typeof current !== "object") return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current ?? undefined;
  }

  get idWas(): unknown {
    return this._idWas ?? null;
  }

  destroy(): void {
    if (!this.existed && this.id == null) {
      this.data = {};
      this.loaded = true;
      this.destroyed = true;
      return;
    }
    if (!this.loaded) {
      this.loadData();
    }
    if (this.id != null) {
      this.store.deleteSession(this.env, this.id, this.options);
    }
    this.data = {};
    this.destroyed = true;
  }

  get empty(): boolean {
    return this.keys.length === 0;
  }

  toHash(): Record<string, unknown> {
    return { ...this.getData() };
  }

  toH(): Record<string, unknown> {
    return this.toHash();
  }
}
