import { Mail } from "../../mail.js";
import type { Message } from "../../message.js";

export interface RetrieverOptions {
  what?: "first" | "last";
  count?: number | "all";
  order?: "asc" | "desc";
  deleteAfterFind?: boolean;
  [key: string]: unknown;
}

type Finder = Retriever & {
  find(options: RetrieverOptions, block?: (email: Message) => unknown): unknown;
};

export class Retriever {
  first(
    this: Finder,
    options: RetrieverOptions | null = null,
    block?: (email: Message) => unknown,
  ): unknown {
    options = options ? { ...options } : {};
    options.what = "first";
    options.count ??= 1;
    return this.find(options, block);
  }

  last(
    this: Finder,
    options: RetrieverOptions | null = null,
    block?: (email: Message) => unknown,
  ): unknown {
    options = options ? { ...options } : {};
    options.what = "last";
    options.count ??= 1;
    return this.find(options, block);
  }

  all(
    this: Finder,
    options: RetrieverOptions | null = null,
    block?: (email: Message) => unknown,
  ): unknown {
    options = options ? { ...options } : {};
    options.count = "all";
    return this.find(options, block);
  }

  findAndDelete(
    this: Finder,
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

Mail.Retriever = Retriever;
