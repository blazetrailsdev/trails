import { Chainable, chainableProxy, type Operation } from "../chainable.js";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Stub: any = chainableProxy({ ...Chainable, Processor: StubProcessor });
