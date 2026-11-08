import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { deepMerge, isPlainObject } from "./hash-utils.js";

export class OptionMerger {
  static toString(): string {
    return "ActiveSupport::OptionMerger";
  }

  private context: any;
  private options: Record<string, unknown>;

  constructor(context: any, options: Record<string, unknown>) {
    this.context = context;
    this.options = options;
  }

  private methodMissing(method: string, ...args: unknown[]): unknown {
    let options: Record<string, unknown> | null = null;
    const block =
      args.length > 1 && typeof args[args.length - 1] === "function" ? args.pop() : null;

    if (args.length === 1 && typeof args[0] === "function") {
      const proc = args.shift() as (...procArgs: unknown[]) => Record<string, unknown>;
      args.push((...procArgs: unknown[]) => deepMerge(this.options, proc(...procArgs)));
    } else if (isPlainObject(args[args.length - 1])) {
      options = deepMerge(this.options, args.pop() as Record<string, unknown>);
    } else {
      options = this.options;
    }

    if (options) args.push({ ...options });
    if (block) args.push(block);

    return this.context[method](...args);
  }

  /** @internal */
  private respondToMissing(name: string, includePrivate = false): boolean {
    return rbObjRespondTo(this.context, name);
  }
}

Object.setPrototypeOf(
  OptionMerger.prototype,
  new Proxy(Object.create(Object.getPrototypeOf(OptionMerger.prototype) as object) as object, {
    get(target, property, receiver) {
      if (typeof property === "symbol" || receiver === OptionMerger.prototype) {
        return Reflect.get(target, property, receiver);
      }
      const value = Reflect.get((receiver as unknown as { context: object }).context, property);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        (receiver as { methodMissing(...args: unknown[]): unknown }).methodMissing(
          property,
          ...args,
        );
    },
  }),
);
