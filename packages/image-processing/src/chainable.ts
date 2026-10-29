import {
  isPlainHash,
  NoMethodError,
  PROTOCOL_PROBES,
  rbBlockGivenP,
  rbFSend,
} from "@blazetrails/ruby-compat";
import { Builder } from "./builder.js";

export type Operation = [string, unknown[]] | [string, unknown[], (...args: never[]) => unknown];

export interface Options {
  source: unknown;
  loader: Record<string, unknown>;
  saver: Record<string, unknown>;
  format: string | null;
  operations: Operation[];
  processor: unknown;
  instrumenter?: (options: Record<string, unknown>, block: () => unknown) => unknown;
  [key: string]: unknown;
}

export interface ChainableHost {
  Processor?: unknown;
  source(file: unknown): Builder;
  convert(format: string | null): Builder;
  loader(options?: Record<string, unknown>): Builder;
  saver(options?: Record<string, unknown>): Builder;
  instrumenter(block: Options["instrumenter"]): Builder;
  apply(operations: Record<string, unknown> | [string, unknown][]): ChainableHost;
  operation(name: string, ...args: unknown[]): Builder;
  call(file?: unknown, options?: { destination?: string | null; save?: boolean }): Promise<unknown>;
  branch(newOptions?: Record<string, unknown>): Builder;
  methodMissing(name: string, ...args: unknown[]): unknown;
  [operation: string]: unknown;
}

export const Chainable = {
  source(this: ChainableHost, file: unknown): Builder {
    return this.branch({ source: file });
  },

  convert(this: ChainableHost, format: string | null): Builder {
    return this.branch({ format });
  },

  loader(this: ChainableHost, options: Record<string, unknown> = {}): Builder {
    return this.branch({ loader: options });
  },

  saver(this: ChainableHost, options: Record<string, unknown> = {}): Builder {
    return this.branch({ saver: options });
  },

  instrumenter(this: ChainableHost, block: Options["instrumenter"]): Builder {
    return this.branch({ instrumenter: block });
  },

  apply(
    this: ChainableHost,
    operations: Record<string, unknown> | [string, unknown][],
  ): ChainableHost {
    const pairs = Array.isArray(operations) ? operations : Object.entries(operations);
    return pairs.reduce<ChainableHost>((builder, [name, argument]) => {
      if (argument === true || argument == null) {
        return rbFSend(builder, name) as ChainableHost;
      } else if (Array.isArray(argument)) {
        return rbFSend(builder, name, ...argument) as ChainableHost;
      } else if (isPlainHash(argument)) {
        return rbFSend(builder, name, argument) as ChainableHost;
      } else {
        return rbFSend(builder, name, argument) as ChainableHost;
      }
    }, this);
  },

  operation(this: ChainableHost, name: string, ...args: unknown[]): Builder {
    const block = rbBlockGivenP(args.at(-1)) ? [args.pop() as () => unknown] : [];
    return this.branch({ operations: [[name, args, ...block] as Operation] });
  },

  call(
    this: ChainableHost,
    file: unknown = null,
    { destination = null, ...callOptions }: { destination?: string | null; save?: boolean } = {},
  ): Promise<unknown> {
    const options: Record<string, unknown> = {};
    if (file != null && file !== false) options.source = file;
    if (destination != null) options.destination = destination;

    return this.branch(options).callBang(callOptions);
  },

  branch(this: ChainableHost, newOptions: Record<string, unknown> = {}): Builder {
    let options: Options;
    if (this instanceof Builder) {
      options = this.options;
    } else {
      options = { ...DEFAULT_OPTIONS, processor: this.Processor };
    }

    const merged: Record<string, unknown> = { ...options };
    for (const [key, newValue] of Object.entries(newOptions)) {
      if (!Object.hasOwn(options, key)) {
        merged[key] = newValue;
        continue;
      }
      const oldValue = options[key];
      switch (key) {
        case "loader":
        case "saver":
          merged[key] = { ...(oldValue as object), ...(newValue as object) };
          break;
        case "operations":
          merged[key] = [...(oldValue as Operation[]), ...(newValue as Operation[])];
          break;
        default:
          merged[key] = newValue;
      }
    }

    return new Builder(Object.freeze(merged) as Options);
  },

  /** @internal */
  methodMissing(this: ChainableHost, name: string, ...args: unknown[]): unknown {
    if (/^is[A-Z]/.test(name)) {
      throw new NoMethodError(
        `undefined method '${name}' for an instance of ${this.constructor.name}`,
        name,
        args,
      );
    }
    if (name.endsWith("Bang")) {
      return (rbFSend(this, name.slice(0, -"Bang".length), ...args) as ChainableHost).call();
    }

    return this.operation(name, ...args);
  },
};

export const DEFAULT_OPTIONS: Options = Object.freeze({
  source: null,
  loader: {},
  saver: {},
  format: null,
  operations: [],
  processor: null,
});

/** @noRailsEquivalent PERMANENT */
export function chainableProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get(proxyTarget, name, receiver) {
      if (name === "then") {
        return (resolve?: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
          (receiver as ChainableHost).call().then(resolve, reject);
      }
      if (
        typeof name === "symbol" ||
        name in proxyTarget ||
        name === "constructor" ||
        PROTOCOL_PROBES.has(name)
      ) {
        return Reflect.get(proxyTarget, name, receiver);
      }
      return (...args: unknown[]) => (receiver as ChainableHost).methodMissing(name, ...args);
    },
  });
}
