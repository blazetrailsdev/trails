import type { Message } from "../../message.js";

export type RetrieverOptions = {
  what?: "first" | "last";
  count?: number | "all";
  order?: "asc" | "desc";
  deleteAfterFind?: boolean;
  [key: string]: unknown;
};

export abstract class Retriever {
  abstract find(options?: RetrieverOptions | null, block?: (email: Message) => unknown): unknown;

  first(options: RetrieverOptions | null = null, block?: (email: Message) => unknown): unknown {
    options = options ? { ...options } : {};
    options.what = "first";
    options.count ??= 1;
    return this.find(options, block);
  }

  last(options: RetrieverOptions | null = null, block?: (email: Message) => unknown): unknown {
    options = options ? { ...options } : {};
    options.what = "last";
    options.count ??= 1;
    return this.find(options, block);
  }

  all(options: RetrieverOptions | null = null, block?: (email: Message) => unknown): unknown {
    options = options ? { ...options } : {};
    options.count = "all";
    return this.find(options, block);
  }

  findAndDelete(
    options: RetrieverOptions | null = null,
    block?: (email: Message) => unknown,
  ): unknown {
    options = options ? { ...options } : {};
    if (options.deleteAfterFind == null || options.deleteAfterFind === false) {
      options.deleteAfterFind = true;
    }
    return this.find(options, block);
  }
}
