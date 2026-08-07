import { DeepMergeable } from "./deep-mergeable.js";
import { isPlainObject } from "./hash-utils.js";

/**
 * Mirrors: ActiveSupport::OptionMerger
 * (activesupport/lib/active_support/option_merger.rb)
 *
 * Ruby undefines every instance method so `method_missing` sees the whole
 * surface. JavaScript has no `method_missing`, so the merger *is* a Proxy over
 * the context returned from the constructor, whose `get` trap routes every
 * forwarded function through {@link OptionMerger#methodMissing}.
 *
 * `methodMissing` deviates from `option_merger.rb:16` on one point, forced by
 * the language: Ruby's block travels outside `arguments`, while TypeScript
 * passes it as a trailing positional argument, so a trailing function argument
 * is held aside before Rails' argument rules run — except when it is the lone
 * argument, which is Ruby's `arguments.first.is_a?(Proc)` branch. Ruby's
 * `**options` splat materializes a fresh Hash, so the forwarded options object
 * is a copy and never `@options` itself.
 */
export class OptionMerger {
  private context: any;
  private options: Record<string, unknown>;

  constructor(context: any, options: Record<string, unknown>) {
    this.context = context;
    this.options = options;

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

    if (options) args.push({ ...options });
    if (block) args.push(block);

    return this.context[method](...args);
  }
}
