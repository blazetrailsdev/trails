import { MimeType } from "../action-dispatch/http/mime-type.js";

export abstract class Collector {
  abstract custom(mime: MimeType, ...args: unknown[]): unknown;

  constructor() {
    return new Proxy(this, COLLECTOR_HANDLER) as this;
  }
}

const RESERVED_KEYS = new Set<string | symbol>(["then", "catch", "finally", "toJSON", "inspect"]);

const COLLECTOR_HANDLER: ProxyHandler<Collector> = {
  get(target, prop, receiver) {
    if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
    if (RESERVED_KEYS.has(prop)) return undefined;
    if (typeof prop !== "string") return undefined;
    if (!MimeType.isRegistered(prop)) {
      return (): never => {
        throw new TypeError(
          `To respond to a custom format, register it as a MIME type first. ` +
            `Unknown format: ${prop}`,
        );
      };
    }
    const mime = MimeType.lookup(prop);
    return (...args: unknown[]): unknown => {
      const fn = Reflect.get(target, "custom", receiver);
      return fn.call(receiver, mime, ...args);
    };
  },

  has(target, prop) {
    if (Reflect.has(target, prop)) return true;
    if (RESERVED_KEYS.has(prop)) return false;
    return typeof prop === "string" && MimeType.isRegistered(prop);
  },
};

/** @internal */
export function generateMethodForMime(mime: MimeType | string): void {
  if (typeof mime === "string" && !MimeType.isRegistered(mime)) {
    throw new TypeError(`generateMethodForMime: unknown MIME ${JSON.stringify(mime)}`);
  }
}
