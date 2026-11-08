import { ImageProcessing } from "./namespaces.js";
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

/** @noRailsEquivalent PERMANENT */
function deleteAccumulator(accumulator: unknown): void {
  if (accumulator == null || typeof accumulator !== "object") return;
  const prototype = Object.getPrototypeOf(accumulator) as { delete?: unknown } | null;
  if (typeof prototype?.delete !== "function") return;
  const handle = accumulator as { delete(): void; isDeleted(): boolean };
  if (!handle.isDeleted()) handle.delete();
}

export class Processor {
  declare static ACCUMULATOR_CLASS: abstract new (...args: never[]) => unknown;

  declare protected _accumulator: unknown;

  /** @inventedArm deleteAccumulator — PERMANENT */
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
      const previous = accumulator;
      accumulator = await this.applyOperation(accumulator, operation);
      if (previous !== source && previous !== accumulator) deleteAccumulator(previous);
    }

    if (destination != null) {
      const result = await this.saveImage(accumulator, destination, saver);
      if (accumulator !== source) deleteAccumulator(accumulator);
      return result;
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

ImageProcessing.Processor = Processor;
