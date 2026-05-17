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

const COLLECTOR_HANDLER: ProxyHandler<Collector> = {
  get(target, prop, receiver) {
    const existing = Reflect.get(target, prop, receiver);
    if (existing !== undefined) return existing;
    if (typeof prop !== "string") return existing;
    const mime = MimeType.lookup(prop);
    if (mime) {
      return (...args: unknown[]): unknown => target.custom(mime, ...args);
    }
    // Unknown format — mirror Rails' NoMethodError message so callers
    // who try `format.fakemime { … }` get a useful hint.
    return (): never => {
      throw new TypeError(
        `To respond to a custom format, register it as a MIME type first. ` +
          `Unknown format: ${prop}`,
      );
    };
  },

  has(target, prop) {
    if (Reflect.has(target, prop)) return true;
    return typeof prop === "string" && MimeType.lookup(prop) !== undefined;
  },
};
