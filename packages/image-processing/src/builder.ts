import { include, type Included } from "@blazetrails/ruby-compat";
import { Chainable, chainableProxy, type Options } from "./chainable.js";
import { Pipeline } from "./pipeline.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Builder extends Included<typeof Chainable> {
  [operation: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Builder {
  readonly options: Options;

  constructor(options: Options) {
    this.options = options;
    return chainableProxy(this);
  }

  callBang(callOptions: { save?: boolean } = {}): Promise<unknown> {
    return this.instrument(() => new Pipeline(this.pipelineOptions()).call(callOptions));
  }

  /** @internal */
  private async instrument(block: () => Promise<unknown>): Promise<unknown> {
    if (!this.options.instrumenter) return block();

    let result: unknown = null;
    let pending: Promise<unknown> | undefined;
    await this.options.instrumenter({ ...this.pipelineOptions() }, () => {
      pending = block().then((value) => (result = value));
      return pending;
    });
    await pending;
    return result;
  }

  /** @internal */
  private pipelineOptions(): Options {
    const { instrumenter: _instrumenter, ...options } = this.options;
    return options as Options;
  }
}

include(Builder, Chainable);
