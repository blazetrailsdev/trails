import { getRubyClassPath } from "@blazetrails/rack-session";
import { hasKey, KeyError } from "@blazetrails/ruby-compat";
import { stringifyKeys } from "@blazetrails/activesupport";

/** @noRailsEquivalent PERMANENT */
export type Req = { env: Record<string, unknown> };

/** @noRailsEquivalent PERMANENT */
export interface SessionStore {
  loadSession(req: Req): [unknown, Record<string, unknown>];
  sessionExists(req: Req): boolean;
  deleteSession(req: Req, id: unknown, options: unknown): unknown;
  extractSessionId(req: Req): unknown;
}

const ENV_SESSION_KEY = "rack.session";
const ENV_SESSION_OPTIONS_KEY = "rack.session.options";

export class DisabledSessionError extends Error {
  constructor(
    message = "Your application has sessions disabled. To write to the session you must first configure a session store",
  ) {
    super(message);
    this.name = "DisabledSessionError";
  }
}

export class Options {
  [key: string]: unknown;

  private by: SessionStore | null;
  private delegate: Record<string, unknown>;

  static set(req: Req, options: unknown): void {
    req.env[ENV_SESSION_OPTIONS_KEY] = options;
  }

  static find(req: Req): unknown {
    return req.env[ENV_SESSION_OPTIONS_KEY];
  }

  constructor(by: SessionStore | null, defaultOptions: Record<string, unknown>) {
    this.by = by;
    this.delegate = { ...defaultOptions };
    return new Proxy(this, {
      get: (target, key, receiver) =>
        Reflect.has(target, key)
          ? Reflect.get(target, key, receiver)
          : target.delegate[key as string],
      has: (target, key) => Reflect.has(target, key) || key in target.delegate,
      ownKeys: (target) => Reflect.ownKeys(target.delegate).filter((k) => !Reflect.has(target, k)),
      getOwnPropertyDescriptor: (target, key) =>
        Reflect.has(target, key)
          ? undefined
          : Object.getOwnPropertyDescriptor(target.delegate, key),
    });
  }

  get(key: string): unknown {
    return this.delegate[key];
  }

  id(req: Req): unknown {
    if (Object.hasOwn(this.delegate, "id")) return this.delegate["id"];
    return this.by!.extractSessionId(req);
  }

  set(k: string, v: unknown): void {
    this.delegate[k] = v;
  }

  toHash(): Record<string, unknown> {
    return { ...this.delegate };
  }

  valuesAt(...args: string[]): unknown[] {
    return args.map((key) => this.delegate[key]);
  }
}

const Unspecified: unknown = {};

function classNameOf(value: unknown): string {
  if (value === null || value === undefined) return "NilClass";
  return (value as { constructor?: { name?: string } }).constructor?.name ?? typeof value;
}

function rubyClassPath(klass: unknown): string {
  switch (klass) {
    case Session:
      return "ActionDispatch::Request::Session";
    default:
      return getRubyClassPath(klass) ?? (klass as { name: string }).name;
  }
}

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;

function objectIdHex(object: object): string {
  let id = objectIds.get(object);
  if (id == null) {
    id = nextObjectId++;
    objectIds.set(object, id);
  }
  return ((id << 1) >>> 0).toString(16).padStart(14, "0");
}

export class Session {
  private by: SessionStore | null;
  private req: Req;
  protected delegate: Record<string, unknown>;
  protected loaded: boolean;
  private exists: boolean | null;
  private enabled: boolean;
  private _idWas: unknown;
  private idWasInitialized: boolean;

  static create(store: SessionStore, req: Req, defaultOptions: Record<string, unknown>): Session {
    const sessionWas = Session.find(req);
    const session = new Session(store, req);
    if (sessionWas) session.mergeBang(sessionWas);

    Session.set(req, session);
    Options.set(req, new Options(store, defaultOptions));
    return session;
  }

  static disabled(req: Req): Session {
    const session = new Session(null, req, { enabled: false });
    Options.set(req, new Options(null, { id: null }));
    return session;
  }

  static find(req: Req): Session | null {
    const session = req.env[ENV_SESSION_KEY];
    if (session instanceof Session) return session;
    return null;
  }

  static set(req: Req, session: unknown): void {
    req.env[ENV_SESSION_KEY] = session;
  }

  static delete(req: Req): void {
    delete req.env[ENV_SESSION_KEY];
  }

  static Options = Options;

  constructor(by: SessionStore | null, req: Req, { enabled = true }: { enabled?: boolean } = {}) {
    this.by = by;
    this.req = req;
    this.delegate = {};
    this.loaded = false;
    this.exists = null;
    this.enabled = enabled;
    this._idWas = null;
    this.idWasInitialized = false;
  }

  id(): unknown {
    return this.options()!.id(this.req);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  options(): Options | undefined {
    return Options.find(this.req) as Options | undefined;
  }

  destroy(): void {
    this.clear();

    if (this.isEnabled()) {
      const options = (this.options() ?? {}) as Options;
      this.by!.deleteSession(this.req, options.id(this.req), options);

      this.loaded = false;
      this.loadForWriteBang();
    }
  }

  get(key: unknown): unknown {
    this.loadForReadBang();
    key = String(key);

    if (key === "session_id") {
      const id = this.id() as { publicId?: unknown } | null | undefined;
      return id == null ? null : id.publicId;
    } else {
      return this.delegate[key as string];
    }
  }

  dig(...keys: unknown[]): unknown {
    this.loadForReadBang();
    keys = keys.map((key, i) => (i === 0 ? String(key) : key));
    let value: unknown = this.delegate;
    for (const key of keys) {
      if (value == null) return undefined;
      value = (value as Record<string, unknown>)[key as string];
    }
    return value;
  }

  hasKey(key: unknown): boolean {
    this.loadForReadBang();
    return hasKey(this.delegate, String(key));
  }

  isKey(key: unknown): boolean {
    return this.hasKey(key);
  }

  isInclude(key: unknown): boolean {
    return this.hasKey(key);
  }

  get keys(): string[] {
    this.loadForReadBang();
    return Object.keys(this.delegate);
  }

  get values(): unknown[] {
    this.loadForReadBang();
    return Object.values(this.delegate);
  }

  set(key: unknown, value: unknown): void {
    this.loadForWriteBang();
    this.delegate[String(key)] = value;
  }

  store(key: unknown, value: unknown): void {
    this.set(key, value);
  }

  clear(): void {
    this.loadForDeleteBang();
    this.delegate = {};
  }

  toHash(): Record<string, unknown> {
    this.loadForReadBang();
    const dup = { ...this.delegate };
    for (const [k, v] of Object.entries(dup)) {
      if (v == null) delete dup[k];
    }
    return dup;
  }

  toH(): Record<string, unknown> {
    return this.toHash();
  }

  update(hash: unknown): Record<string, unknown> {
    const other = hash as { toHash?: () => Record<string, unknown> } | null | undefined;
    const respondsToToHash = typeof other?.toHash === "function";
    if (!respondsToToHash && (hash == null || typeof hash !== "object" || Array.isArray(hash))) {
      throw new TypeError(`no implicit conversion of ${classNameOf(hash)} into Hash`);
    }

    this.loadForWriteBang();
    return Object.assign(
      this.delegate,
      stringifyKeys(respondsToToHash ? other.toHash!() : (hash as Record<string, unknown>)),
    );
  }

  mergeBang(hash: unknown): Record<string, unknown> {
    return this.update(hash);
  }

  delete(key: unknown): unknown {
    this.loadForDeleteBang();
    const k = String(key);
    const value = this.delegate[k];
    delete this.delegate[k];
    return value;
  }

  fetch(
    key: unknown,
    defaultValue: unknown = Unspecified,
    block?: (key: string) => unknown,
  ): unknown {
    this.loadForReadBang();
    const k = String(key);
    if (defaultValue === Unspecified) {
      if (Object.hasOwn(this.delegate, k)) return this.delegate[k];
      if (block) return block(k);
      throw new KeyError(`key not found: "${k}"`);
    } else {
      if (Object.hasOwn(this.delegate, k)) return this.delegate[k];
      if (block) return block(k);
      return defaultValue;
    }
  }

  inspect(): string {
    if (this.isLoaded()) {
      return `#<ActionDispatch::Request::Session:0x${objectIdHex(this)}>`;
    } else {
      return `#<${rubyClassPath(this.constructor)}:0x${objectIdHex(this)} not yet loaded>`;
    }
  }

  isExists(): boolean {
    if (!this.isEnabled()) return false;
    if (this.exists !== null) return this.exists;
    return (this.exists = this.by!.sessionExists(this.req));
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  isEmpty(): boolean {
    this.loadForReadBang();
    return Object.keys(this.delegate).length === 0;
  }

  each(block: (key: string, value: unknown) => void): void {
    for (const [key, value] of Object.entries(this.toHash())) {
      block(key, value);
    }
  }

  idWas(): unknown {
    this.loadForReadBang();
    return this._idWas;
  }

  private loadForReadBang(): void {
    if (!this.isLoaded() && this.isExists()) this.loadBang();
  }

  private loadForWriteBang(): void {
    if (this.isEnabled()) {
      if (!this.isLoaded()) this.loadBang();
    } else {
      throw new DisabledSessionError();
    }
  }

  private loadForDeleteBang(): void {
    if (this.isEnabled() && !this.isLoaded()) this.loadBang();
  }

  /**
   * @missingRailsCall replace — PERMANENT
   * @internal
   */
  loadBang(): void {
    if (this.isEnabled()) {
      if (!this.isExists()) this.idWasInitialized = true;
      const [id, session] = this.by!.loadSession(this.req);
      this.options()!.set("id", id);
      this.delegate = stringifyKeys(session);
      if (!this.idWasInitialized) this._idWas = id;
    }
    this.idWasInitialized = true;
    this.loaded = true;
  }
}
