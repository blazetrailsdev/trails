import { classAttribute } from "@blazetrails/activesupport";
import { Thread } from "@blazetrails/ruby-compat";
import { Turbo } from "../../../turbo-trails.js";
import { Debouncer } from "./debouncer.js";

interface DebouncerLike {
  debounce(block: () => unknown): unknown;
  wait(): unknown;
}

export class ThreadDebouncer {
  declare static debouncerClass: new (options: { delay: number }) => DebouncerLike;
  declare debouncerClass: new (options: { delay: number }) => DebouncerLike;

  static {
    classAttribute.call(this, "debouncerClass", { default: Debouncer });
  }

  static for(key: string, { delay = Debouncer.DEFAULT_DELAY }: { delay?: number } = {}) {
    const current = Thread.current();
    let debouncer = current.get(key) as ThreadDebouncer | null;
    if (debouncer == null) current.set(key, (debouncer = new this(key, current, { delay })));
    return debouncer;
  }

  /** @internal */
  private readonly key: string;
  /** @internal */
  private readonly debouncer: DebouncerLike;
  /** @internal */
  private readonly thread: Thread;

  protected constructor(key: string, thread: Thread, { delay }: { delay: number }) {
    this.key = key;
    this.debouncer = new this.debouncerClass({ delay });
    this.thread = thread;
  }

  wait(): unknown {
    return this.debouncer.wait();
  }

  debounce(block: () => unknown): unknown {
    return this.debouncer.debounce(async () => {
      const result = await block();
      this.thread.set(this.key, null);
      return result;
    });
  }
}
Turbo.ThreadDebouncer = ThreadDebouncer;
