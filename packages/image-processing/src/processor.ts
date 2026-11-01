import {
  isPlainHash,
  rbBlockGivenP,
  rbFSend,
  rbInspect,
  constSet,
  rbModDefineMethod,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import type { Operation } from "./chainable.js";
import { Error } from "./image-processing.js";

type ProcessorClass = typeof Processor & {
  loadImage(source: unknown, loader: Record<string, unknown>): unknown;
  saveImage(accumulator: unknown, destination: string, saver: Record<string, unknown>): unknown;
};

export class Processor {
  declare static ACCUMULATOR_CLASS: abstract new (...args: never[]) => unknown;

  declare protected _accumulator: unknown;

  static async call(
    this: ProcessorClass,
    {
      source,
      loader,
      operations,
      saver,
      destination = null,
    }: {
      source: unknown;
      loader: Record<string, unknown>;
      operations: Operation[];
      saver: Record<string, unknown>;
      destination?: string | null;
    },
  ): Promise<unknown> {
    if (!(typeof source === "string" || source instanceof this.ACCUMULATOR_CLASS)) {
      throw new Error(`invalid source: ${rbInspect(source)}`);
    }

    let accumulator: unknown;
    if (
      /^resize[A-Z]/.test(String(operations[0]?.[0] ?? "")) &&
      Object.keys(loader).length === 0 &&
      this.supportsResizeOnLoad()
    ) {
      accumulator = source;
    } else {
      accumulator = await this.loadImage(source, loader);
    }

    for (const operation of operations) {
      accumulator = await this.applyOperation(accumulator, operation);
    }

    if (destination != null) {
      return this.saveImage(accumulator, destination, saver);
    } else {
      return accumulator;
    }
  }

  static accumulator(name: string, klass: abstract new (...args: never[]) => unknown): void {
    rbModDefineMethod(this, name, {
      get(this: Processor) {
        return this._accumulator;
      },
    });
    constSet(this, "ACCUMULATOR_CLASS", klass);
  }

  static applyOperation(accumulator: unknown, [name, args, block]: Operation): unknown {
    return new this(accumulator).applyOperation(name, ...args, ...(block ? [block] : []));
  }

  static supportsResizeOnLoad(): boolean {
    return false;
  }

  constructor(accumulator: unknown = null) {
    this._accumulator = accumulator;
  }

  applyOperation(name: string, ...args: unknown[]): unknown {
    const block = rbBlockGivenP(args.at(-1)) ? [args.pop()] : [];
    const receiver = rbObjRespondTo(this, name) ? this : this._accumulator;

    if (isPlainHash(args.at(-1))) {
      const kwargs = args.pop();
      return rbFSend(receiver, name, ...args, kwargs, ...block);
    } else {
      return rbFSend(receiver, name, ...args, ...block);
    }
  }

  custom(block?: (accumulator: unknown) => unknown): unknown {
    const result = block != null ? block(this._accumulator) : null;
    return result != null && result !== false ? result : this._accumulator;
  }
}
