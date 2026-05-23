import { MimeType } from "../action-dispatch/http/mime-type.js";

/**
 * `AbstractController::Collector` — base class for objects that
 * dispatch per-MIME-type method calls (e.g. `format.html { … }`,
 * `format.json { … }`) to a single `custom(mime, …)` handler.
 *
 * In Rails this is a module that `class_eval`s a method per registered
 * MIME and uses `method_missing` for newly-registered ones. JS has no
 * `method_missing`; we use a `Proxy` so any property access for a
 * registered MIME symbol auto-dispatches to `custom()`. The same Proxy
 * also picks up MIME types registered after construction.
 *
 * Subclasses must implement `custom(mime, …args)` and may declare
 * additional non-MIME methods normally.
 *
 * **Limitation — ECMAScript `#private` fields:** the constructor
 * returns a Proxy, so `this` inside instance methods is the Proxy
 * (intentional — lets `this.html()` inside `custom()` re-enter the
 * MIME dispatch). ECMAScript private fields are looked up on the
 * underlying object, not through a Proxy, so a subclass that uses
 * `#state`-style fields will throw at runtime. Use a normal
 * `private` TypeScript field or a `_` prefix instead — both are
 * stored as regular own properties and traverse the Proxy correctly.
 */
export abstract class Collector {
  /** Implemented by subclasses; invoked when a per-MIME method is called. */
  abstract custom(mime: MimeType, ...args: unknown[]): unknown;

  constructor() {
    // Return a Proxy of `this` so unknown gets resolve to a per-MIME
    // function bound through `custom()`. Real properties on the subclass
    // (`html`, `custom`, `_state`, etc.) shadow the Proxy fallback.
    return new Proxy(this, COLLECTOR_HANDLER) as this;
  }
}

// Keys we must never intercept. `then`/`catch`/`finally` would make
// the instance look thenable (assimilated by Promise.resolve / await).
// `toJSON` would be called by JSON.stringify; synthesizing a thrower
// there breaks serialization. `Symbol.toPrimitive` and `toString` are
// kept inert too so coercion never hits the unknown-format thrower.
const RESERVED_KEYS = new Set<string | symbol>([
  "then",
  "catch",
  "finally",
  "toJSON",
  // Node's util.inspect / console.log call `obj.inspect()` when it
  // exists. Synthesizing a thrower there breaks routine logging.
  "inspect",
]);

const COLLECTOR_HANDLER: ProxyHandler<Collector> = {
  get(target, prop, receiver) {
    // Shadowing: any real own/inherited property — including ones that
    // intentionally hold `undefined` — must win. Use Reflect.has rather
    // than the undefined check so a subclass `myProp = undefined` isn't
    // mistakenly routed through MIME dispatch.
    if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
    if (RESERVED_KEYS.has(prop)) return undefined;
    if (typeof prop !== "string") return undefined;
    if (!MimeType.isRegistered(prop)) {
      // Unknown format — mirror Rails' NoMethodError message so callers
      // who try `format.fakemime { … }` get a useful hint.
      return (): never => {
        throw new TypeError(
          `To respond to a custom format, register it as a MIME type first. ` +
            `Unknown format: ${prop}`,
        );
      };
    }
    const mime = MimeType.lookup(prop);
    // Bind `this` inside custom() to the Proxy receiver, not the raw
    // target — otherwise property access inside custom() would bypass
    // this proxy and miss the MIME dispatch / shadowing rules. Mirrors
    // how `format.html(...)` and `format.custom(...)` should resolve
    // the same `this` for subclasses.
    return (...args: unknown[]): unknown => {
      const fn = Reflect.get(target, "custom", receiver) as Collector["custom"];
      return fn.call(receiver, mime, ...args);
    };
  },

  has(target, prop) {
    if (Reflect.has(target, prop)) return true;
    // Keep `has` in lockstep with `get`: if get returns undefined for
    // these keys, has must report false even when a MIME type is
    // registered under a colliding symbol.
    if (RESERVED_KEYS.has(prop)) return false;
    return typeof prop === "string" && MimeType.isRegistered(prop);
  },
};

/**
 * Rails generates a `format.<sym>(...)` method per registered MIME at
 * class-eval time. The trails Proxy resolves MIME dispatch dynamically
 * from `MimeType.lookup`, so the Rails-shaped eager generation step is
 * a no-op for us — the Proxy already picks up any MIME registered later.
 * Kept as a Rails-named entry point so `api:compare` matches and so
 * `MimeType.register_callback`-style wiring has a target to call. The
 * mime arg is validated via `MimeType.isRegistered` to surface typos early.
 *
 * @internal
 */
export function generateMethodForMime(mime: MimeType | string): void {
  if (typeof mime === "string" && !MimeType.isRegistered(mime)) {
    throw new TypeError(`generateMethodForMime: unknown MIME ${JSON.stringify(mime)}`);
  }
}
