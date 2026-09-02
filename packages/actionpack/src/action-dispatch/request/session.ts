import { hasKey } from "@blazetrails/ruby-compat";
import { KeyError, stringifyKeys } from "@blazetrails/activesupport";

/**
 * ActionDispatch::Request::Session
 *
 * Wraps a session store and provides a Hash-like interface for session data.
 * Supports lazy loading, destruction, and tracking of the original session id.
 */

/**
 * The `ActionDispatch::Request` shape `Session` reads and writes headers on.
 * Ruby passes the request itself; TS names the structural minimum.
 *
 * @noRailsEquivalent PERMANENT — structural stand-in for `ActionDispatch::Request`,
 * which this file must not import (it would close a module cycle).
 */
export type Req = { env: Record<string, unknown> };

/**
 * The duck type `Session` requires of the store it wraps (Rails' `@by`,
 * a Rack session middleware). Ruby names no constant for it.
 *
 * @noRailsEquivalent PERMANENT — name collision only. Ruby's `SessionStore`
 * (`ActionController::RequestForgeryProtection::SessionStore`) is the CSRF
 * token store strategy, unrelated to this Rack-store shape.
 */
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

/**
 * Mirrors: ActionDispatch::Request::Session::Options (`request/session.rb:47`).
 *
 * `Rack::Session::Abstract::Persisted` reads its options as a Hash —
 * `options[:skip]` (`vendor/rack-session/lib/rack/session/abstract/id.rb:351`),
 * `values_at` (`:368`), `cookie.merge!(options)` (`:411`) — and Ruby's duck
 * typing lets an Options answer all three through `[]` / `to_hash`. TS has no
 * operator overloading, so the constructor surfaces the delegate through a
 * Proxy as ordinary property reads, keeping `[]` ported as `get` beside them.
 *
 * Ruby dispatches `options[:id]` and `options.id` as two unrelated calls; one
 * JS property read cannot, so a member name wins over a stored key of the same
 * name — `Options#id` (`request/session.rb:65-69`) stays callable over the
 * `:id` that `Session#load!` stores (`:275`), the one key Rails seats whose
 * name a member also claims. A colliding key is left out of `ownKeys` for the
 * same reason, so generic JS iteration never hands a caller a method as data.
 * `to_hash` (`:72`) is unfiltered, and it is what `cookie.merge!(options)`
 * (`vendor/rack-session/lib/rack/session/abstract/id.rb:411`) converts through.
 */
export class Options {
  [key: string]: unknown;

  private by: SessionStore | null;
  private delegate: Record<string, unknown>;

  /**
   * Mirrors: ActionDispatch::Request::Session::Options.set
   * (`request/session.rb:48-50`) —
   * `req.set_header ENV_SESSION_OPTIONS_KEY, options`.
   */
  static set(req: Req, options: unknown): void {
    req.env[ENV_SESSION_OPTIONS_KEY] = options;
  }

  /**
   * Mirrors: ActionDispatch::Request::Session::Options.find
   * (`request/session.rb:52-54`) — `req.get_header ENV_SESSION_OPTIONS_KEY`.
   */
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

  /** Mirrors: `Options#[]` (`request/session.rb:61-63`). */
  get(key: string): unknown {
    return this.delegate[key];
  }

  /** Mirrors: `Options#id` (`request/session.rb:65-69`). */
  id(req: Req): unknown {
    // Ruby's `fetch` with a block returns the STORED value whenever the key
    // exists — including a stored `nil`, which is how a disabled session
    // short-circuits the `@by` lookup.
    if (Object.hasOwn(this.delegate, "id")) return this.delegate["id"];
    return this.by!.extractSessionId(req);
  }

  /** Mirrors: `Options#[]=` (`request/session.rb:71`). */
  set(k: string, v: unknown): void {
    this.delegate[k] = v;
  }

  /** Mirrors: `Options#to_hash` (`request/session.rb:72`). */
  toHash(): Record<string, unknown> {
    return { ...this.delegate };
  }

  /** Mirrors: `Options#values_at` (`request/session.rb:73`). */
  valuesAt(...args: string[]): unknown[] {
    return args.map((key) => this.delegate[key]);
  }
}

/**
 * Singleton object used to determine if an optional param wasn't specified
 * (`request/session.rb:16`).
 */
const Unspecified: unknown = {};

/** Ruby's `hash.class.name` for the `Session#update` TypeError message. */
function classNameOf(value: unknown): string {
  if (value === null || value === undefined) return "NilClass";
  return (value as { constructor?: { name?: string } }).constructor?.name ?? typeof value;
}

/**
 * Ruby's `object_id` — a per-object identity number JS does not expose, handed
 * out lazily and remembered on a WeakMap, shifted and hexed the way
 * `(object_id << 1).to_s(16)` renders it. Same spelling as
 * `KeyGenerator#inspect` (`activesupport/src/key-generator.ts:69`).
 */
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
  /** Rails' `@delegate` — `protected` so `NullSessionHash` can seed it. */
  protected delegate: Record<string, unknown>;
  /** Rails' `@loaded` — `protected` so `NullSessionHash` can seed it. */
  protected loaded: boolean;
  private exists: boolean | null;
  private enabled: boolean;
  private _idWas: unknown;
  private idWasInitialized: boolean;

  /**
   * Mirrors: `Session.create` (`request/session.rb:19-27`) — creates a session
   * hash, merging the properties of the previous session if any.
   */
  static create(store: SessionStore, req: Req, defaultOptions: Record<string, unknown>): Session {
    const sessionWas = Session.find(req);
    const session = new Session(store, req);
    if (sessionWas) session.mergeBang(sessionWas);

    Session.set(req, session);
    Options.set(req, new Options(store, defaultOptions));
    return session;
  }

  /** Mirrors: `Session.disabled` (`request/session.rb:29-33`). */
  static disabled(req: Req): Session {
    const session = new Session(null, req, { enabled: false });
    Options.set(req, new Options(null, { id: null }));
    return session;
  }

  /** Mirrors: `Session.find` (`request/session.rb:35-37`). */
  static find(req: Req): Session | null {
    const session = req.env[ENV_SESSION_KEY];
    if (session instanceof Session) return session;
    return null;
  }

  /**
   * Mirrors: ActionDispatch::Request::Session.set
   * (`request/session.rb:39-41`) — `req.set_header ENV_SESSION_KEY, session`.
   */
  static set(req: Req, session: unknown): void {
    req.env[ENV_SESSION_KEY] = session;
  }

  /** Mirrors: `Session.delete` (`request/session.rb:43-45`). */
  static delete(req: Req): void {
    delete req.env[ENV_SESSION_KEY];
  }

  /**
   * Mirrors: ActionDispatch::Request::Session::Options
   * (`request/session.rb:47`). Ruby nests the class inside `Session`; TS has no
   * nested-class syntax, so it is declared alongside and re-exported as
   * `Session.Options` so call sites read as Ruby does.
   */
  static Options = Options;

  /** Mirrors: `Session#initialize` (`request/session.rb:75-83`). */
  constructor(by: SessionStore | null, req: Req, { enabled = true }: { enabled?: boolean } = {}) {
    this.by = by;
    this.req = req;
    this.delegate = {};
    this.loaded = false;
    this.exists = null; // We haven't checked yet.
    this.enabled = enabled;
    this._idWas = null;
    this.idWasInitialized = false;
  }

  /** Mirrors: `Session#id` (`request/session.rb:85-87`). */
  id(): unknown {
    return this.options()!.id(this.req);
  }

  /** Mirrors: `Session#enabled?` (`request/session.rb:89-91`). */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Mirrors: `Session#options` (`request/session.rb:93-95`). */
  options(): Options | undefined {
    return Options.find(this.req) as Options | undefined;
  }

  /** Mirrors: `Session#destroy` (`request/session.rb:97-108`). */
  destroy(): void {
    this.clear();

    if (this.isEnabled()) {
      const options = (this.options() ?? {}) as Options;
      this.by!.deleteSession(this.req, options.id(this.req), options);

      // Load the new sid to be written with the response.
      this.loaded = false;
      this.loadForWriteBang();
    }
  }

  /**
   * Mirrors: `Session#[]` (`request/session.rb:112-121`) — returns value of the
   * key stored in the session or `nil` if the given key is not found.
   */
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

  /**
   * Mirrors: `Session#dig` (`request/session.rb:125-129`) — returns the nested
   * value specified by the sequence of keys, or `nil` if any intermediate step
   * is `nil`.
   */
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

  /** Mirrors: `Session#has_key?` (`request/session.rb:132-135`). */
  hasKey(key: unknown): boolean {
    this.loadForReadBang();
    return hasKey(this.delegate, String(key));
  }

  /** Mirrors: `alias :key? :has_key?` (`request/session.rb:136`). */
  isKey(key: unknown): boolean {
    return this.hasKey(key);
  }

  /** Mirrors: `alias :include? :has_key?` (`request/session.rb:137`). */
  isInclude(key: unknown): boolean {
    return this.hasKey(key);
  }

  /** Mirrors: `Session#keys` (`request/session.rb:140-143`) — returns keys of the session as Array. */
  get keys(): string[] {
    this.loadForReadBang();
    return Object.keys(this.delegate);
  }

  /** Mirrors: `Session#values` (`request/session.rb:146-149`) — returns values of the session as Array. */
  get values(): unknown[] {
    this.loadForReadBang();
    return Object.values(this.delegate);
  }

  /** Mirrors: `Session#[]=` (`request/session.rb:152-155`) — writes given value to given key. */
  set(key: unknown, value: unknown): void {
    this.loadForWriteBang();
    this.delegate[String(key)] = value;
  }

  /** Mirrors: `alias store []=` (`request/session.rb:156`). */
  store(key: unknown, value: unknown): void {
    this.set(key, value);
  }

  /** Mirrors: `Session#clear` (`request/session.rb:159-162`) — clears the session. */
  clear(): void {
    this.loadForDeleteBang();
    this.delegate = {};
  }

  /** Mirrors: `Session#to_hash` (`request/session.rb:165-168`) — returns the session as Hash. */
  toHash(): Record<string, unknown> {
    this.loadForReadBang();
    const dup = { ...this.delegate };
    for (const [k, v] of Object.entries(dup)) {
      if (v == null) delete dup[k];
    }
    return dup;
  }

  /** Mirrors: `alias :to_h :to_hash` (`request/session.rb:169`). */
  toH(): Record<string, unknown> {
    return this.toHash();
  }

  /** Mirrors: `Session#update` (`request/session.rb:181-189`) — updates the session with given Hash. */
  update(hash: unknown): Record<string, unknown> {
    const other = hash as { toHash?: () => Record<string, unknown> } | null | undefined;
    // Ruby's `respond_to?(:to_hash)`: a Hash and anything defining `to_hash`
    // convert; an Array does not, so it must raise rather than be spread.
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

  /** Mirrors: `alias :merge! :update` (`request/session.rb:190`). */
  mergeBang(hash: unknown): Record<string, unknown> {
    return this.update(hash);
  }

  /** Mirrors: `Session#delete` (`request/session.rb:193-196`) — deletes given key from the session. */
  delete(key: unknown): unknown {
    this.loadForDeleteBang();
    const k = String(key);
    const value = this.delegate[k];
    delete this.delegate[k];
    return value;
  }

  /**
   * Mirrors: `Session#fetch` (`request/session.rb:211-218`) — returns value of
   * the given key, or raises `KeyError` if it can't be found and no default is
   * set.
   */
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

  /**
   * Mirrors: `Session#inspect` (`request/session.rb:222-228`).
   *
   * The loaded arm is Ruby's `super`, i.e. `Object#inspect`. JS has no
   * equivalent that lists instance variables, so it renders the identity form
   * `#<Class:0x…>` — the same spelling `KeyGenerator#inspect` uses in
   * activesupport for `(object_id << 1).to_s(16)`.
   */
  inspect(): string {
    if (this.isLoaded()) {
      return `#<ActionDispatch::Request::Session:0x${objectIdHex(this)}>`;
    } else {
      return `#<ActionDispatch::Request::Session:0x${objectIdHex(this)} not yet loaded>`;
    }
  }

  /** Mirrors: `Session#exists?` (`request/session.rb:228-232`). */
  isExists(): boolean {
    if (!this.isEnabled()) return false;
    if (this.exists !== null) return this.exists;
    return (this.exists = this.by!.sessionExists(this.req));
  }

  /** Mirrors: `Session#loaded?` (`request/session.rb:234-236`). */
  isLoaded(): boolean {
    return this.loaded;
  }

  /** Mirrors: `Session#empty?` (`request/session.rb:238-241`). */
  isEmpty(): boolean {
    this.loadForReadBang();
    return Object.keys(this.delegate).length === 0;
  }

  /** Mirrors: `Session#each` (`request/session.rb:243-245`). */
  each(block: (key: string, value: unknown) => void): void {
    for (const [key, value] of Object.entries(this.toHash())) {
      block(key, value);
    }
  }

  /** Mirrors: `Session#id_was` (`request/session.rb:247-250`). */
  idWas(): unknown {
    this.loadForReadBang();
    return this._idWas;
  }

  /** Mirrors: `Session#load_for_read!` (`request/session.rb:253-255`). */
  private loadForReadBang(): void {
    if (!this.isLoaded() && this.isExists()) this.loadBang();
  }

  /** Mirrors: `Session#load_for_write!` (`request/session.rb:257-263`). */
  private loadForWriteBang(): void {
    if (this.isEnabled()) {
      if (!this.isLoaded()) this.loadBang();
    } else {
      throw new DisabledSessionError();
    }
  }

  /** Mirrors: `Session#load_for_delete!` (`request/session.rb:265-267`). */
  private loadForDeleteBang(): void {
    if (this.isEnabled() && !this.isLoaded()) this.loadBang();
  }

  /**
   * Mirrors: `Session#load!` (`request/session.rb:269-278`).
   *
   * @missingRailsCall replace — PERMANENT: Language shortcoming: Rails' `@delegate.replace`
   * empties the Hash and refills it in place; a plain JS object has no in-place
   * replace, and `@delegate` is never aliased out of this class, so rebinding it
   * is the same observable state.
   *
   * @internal Ruby-private; `Rack::Session::Abstract::Persisted#commit_session`
   * reaches it with `session.send(:load!)` (`vendor/rack-session/lib/rack/session/abstract/id.rb:392`).
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
