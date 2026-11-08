import { NotImplementedError, type Tempfile } from "@blazetrails/ruby-compat";
import { Transformers } from "../active-storage.js";

export class Transformer {
  readonly transformations: Record<string, unknown>;

  constructor(transformations: Record<string, unknown>) {
    this.transformations = transformations;
  }

  async transform<T>(
    file: unknown,
    { format }: { format: string },
    block: (output: Tempfile) => T,
  ): Promise<Awaited<T>> {
    const output = await this.process(file, { format: format });

    try {
      return await block(output);
    } finally {
      output.closeBang();
    }
  }

  /** @internal */
  protected async process(_file: unknown, _options: { format: string }): Promise<Tempfile> {
    throw new NotImplementedError();
  }
}

Transformers.Transformer = Transformer;
