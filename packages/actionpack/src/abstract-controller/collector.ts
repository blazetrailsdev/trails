import { Mime, MimeType } from "../action-dispatch/http/mime-type.js";

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
    const mimeConstant = Mime.get(prop);
    if (!mimeConstant) {
      return (): never => {
        throw new TypeError(
          `To respond to a custom format, register it as a MIME type first. ` +
            `Unknown format: ${prop}`,
        );
      };
    }
    return (...args: unknown[]): unknown => {
      const fn = Reflect.get(target, "custom", receiver);
      return fn.call(receiver, mimeConstant, ...args);
    };
  },

  has(target, prop) {
    if (Reflect.has(target, prop)) return true;
    if (RESERVED_KEYS.has(prop)) return false;
    return typeof prop === "string" && Mime.get(prop) !== undefined;
  },
};

/** @internal */
export function generateMethodForMime(mime: MimeType | string): void {
  if (typeof mime === "string" && !Mime.get(mime)) {
    throw new TypeError(`generateMethodForMime: unknown MIME ${JSON.stringify(mime)}`);
  }
}
