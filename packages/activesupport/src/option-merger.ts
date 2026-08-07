/**
 * Mirrors: ActiveSupport::OptionMerger
 * (activesupport/lib/active_support/option_merger.rb)
 */

import { DeepMergeable } from "./deep-mergeable.js";
import { isPlainObject } from "./hash-utils.js";

export class OptionMerger {
  private context: any;
  private options: Record<string, unknown>;

  constructor(context: any, options: Record<string, unknown>) {
    this.context = context;
    this.options = options;

    // Ruby undefines every instance method so that `method_missing` sees the
    // whole surface. JS has no `method_missing`, so the merger *is* a Proxy
    // over the context whose `get` trap routes calls through `methodMissing`.
    return new Proxy(context, {
      get: (target: object, property: string | symbol): unknown => {
        const value = Reflect.get(target, property);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => this.methodMissing(property as string, ...args);
      },
    }) as unknown as OptionMerger;
  }

  private methodMissing(method: string, ...args: unknown[]): unknown {
    let options: Record<string, unknown> | null = null;

    // Ruby's block travels outside `arguments`; in TypeScript it is a trailing
    // positional argument, so hold it aside before applying Rails' rules — but
    // only when it is not the lone argument, which is Ruby's Proc-arg branch
    // below.
    const block =
      args.length > 1 && typeof args[args.length - 1] === "function" ? args.pop() : null;

    if (args.length === 1 && typeof args[0] === "function") {
      const proc = args.shift() as (...procArgs: unknown[]) => Record<string, unknown>;
      args.push((...procArgs: unknown[]) =>
        DeepMergeable.deepMerge(this.options, proc(...procArgs)),
      );
    } else if (isPlainObject(args[args.length - 1])) {
      options = DeepMergeable.deepMerge(this.options, args.pop() as Record<string, unknown>);
    } else {
      options = this.options;
    }

    // Ruby forwards these as `**options`, and the double-splat materializes a
    // fresh Hash — callers must not receive @options itself.
    if (options) args.push({ ...options });
    if (block) args.push(block);

    return this.context[method](...args);
  }
}
