import { Chainable, chainableProxy, type Options } from "../chainable.js";
import { Processor } from "../processor.js";

export class StubImage {
  constructor(
    readonly path: string,
    readonly operations: [string, unknown[]][] = [],
  ) {}

  invert(): StubImage {
    return new StubImage(this.path, [...this.operations, ["invert", []]]);
  }

  shrink(...args: unknown[]): StubImage {
    return new StubImage(this.path, [...this.operations, ["shrink", args]]);
  }

  resizeToLimit(...args: unknown[]): StubImage {
    return new StubImage(this.path, [...this.operations, ["resizeToLimit", args]]);
  }
}

export class StubProcessor extends Processor {
  static calls: { operations: [string, unknown[]][]; destination: string }[] = [];

  static {
    this.accumulator("image", StubImage);
  }

  static loadImage(source: string | StubImage): StubImage {
    return typeof source === "string" ? new StubImage(source) : source;
  }

  static saveImage(image: StubImage, destination: string): void {
    StubProcessor.calls.push({ operations: image.operations, destination });
  }
}

export type Chain = { options: Options } & { [operation: string]: (...args: unknown[]) => Chain };

export const Stub = chainableProxy({ ...Chainable, Processor: StubProcessor }) as unknown as Chain;
