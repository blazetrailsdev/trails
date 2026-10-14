import { Module, camelize, underscore } from "@blazetrails/activesupport";
import {
  KERNEL_METHODS,
  NoMethodError,
  PROTOCOL_PROBES,
  included,
  rbFPublicSend,
  rbObjClassname,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { Mime, MimeType } from "../action-dispatch/http/mime-type.js";

const spliced = new WeakSet<object>();

export const Collector = new Module((mod) => {
  mod.defineMethod("methodMissing", methodMissing);

  (mod as unknown as Record<symbol, unknown>)[included] = (base: { prototype: object }): void => {
    let link = Object.getPrototypeOf(base.prototype) as object | null;
    while (
      link &&
      Object.getOwnPropertyDescriptor(link, "methodMissing")?.value !== methodMissing
    ) {
      link = Object.getPrototypeOf(link) as object | null;
    }
    if (!link || spliced.has(link)) return;
    spliced.add(link);
    Object.setPrototypeOf(
      link,
      new Proxy(Object.create(Object.getPrototypeOf(link) as object) as object, {
        get(target, prop, receiver: { methodMissing: typeof methodMissing }) {
          const value = Reflect.get(target, prop, receiver);
          if (value !== undefined || typeof prop === "symbol" || Reflect.has(target, prop)) {
            return value;
          }
          if (KERNEL_METHODS.has(prop) || PROTOCOL_PROBES.has(prop)) return value;
          return (...args: unknown[]) => receiver.methodMissing(prop, ...args);
        },
      }),
    );
  };
}) as Module & {
  generateMethodForMime: typeof generateMethodForMime;
};
Collector.generateMethodForMime = generateMethodForMime;

function generateMethodForMime(mime: MimeType | string): void {
  const sym = typeof mime === "string" ? mime : mime.toSym()!;
  Collector.defineMethod(
    camelize(symbolToS(sym), false),
    function (
      this: { custom(mime: MimeType | undefined, ...args: unknown[]): unknown },
      ...args: unknown[]
    ) {
      return this.custom(Mime.get(sym), ...args);
    },
  );
}

MimeType.SET.each((mime) => {
  generateMethodForMime(mime);
});

MimeType.registerCallback((mime) => {
  if (!Collector.instanceMethods().includes(camelize(symbolToS(mime.toSym()!), false))) {
    generateMethodForMime(mime);
  }
});

/** @internal */
export function methodMissing(this: object, symbol: string, ...args: unknown[]): unknown {
  const mimeConstant = Mime.get(underscore(symbol));
  if (mimeConstant == null) {
    throw new NoMethodError(
      "To respond to a custom format, register it as a MIME type first: " +
        "https://guides.rubyonrails.org/action_controller_overview.html#restful-downloads. " +
        "If you meant to respond to a variant like :tablet or :phone, not a custom format, " +
        "be sure to nest your variant response within a format response: " +
        "format.html { |html| html.tablet { ... } }",
    );
  }

  if (MimeType.SET.isInclude(mimeConstant)) {
    Collector.generateMethodForMime(mimeConstant);
    return rbFPublicSend(this, camelize(symbol, false), ...args);
  } else {
    const super_ = Collector.superMethod(this, "methodMissing");
    if (super_ !== undefined) return super_(symbol, ...args);
    throw new NoMethodError(
      `undefined method '${symbol}' for an instance of ${rbObjClassname(this)}`,
      symbol,
      args,
      false,
      { receiver: this },
    );
  }
}
