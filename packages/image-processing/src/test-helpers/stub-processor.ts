import { Chainable, chainableProxy, type Operation, type Options } from "../chainable.js";

export const StubProcessor = {
  calls: [] as Record<string, unknown>[],
  call(options: {
    source: unknown;
    loader: Record<string, unknown>;
    operations: Operation[];
    saver: Record<string, unknown>;
    destination?: string;
  }) {
    StubProcessor.calls.push(options);
    return options.destination == null ? options : undefined;
  },
};

export type Chain = { options: Options } & { [operation: string]: (...args: unknown[]) => Chain };

export const Stub = chainableProxy({ ...Chainable, Processor: StubProcessor }) as unknown as Chain;
