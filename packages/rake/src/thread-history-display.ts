import { include, printf, puts, stdout as $stdout } from "@blazetrails/ruby-compat";
import { succ } from "@blazetrails/ruby-compat/string/succ";
import { PrivateReader } from "./private-reader.js";
import type { HistoryEvent } from "./thread-pool.js";

type Renames = Record<string, string | number>;

export class ThreadHistoryDisplay {
  declare private stats: HistoryEvent[];
  declare private items: Renames;
  declare private threads: Renames;
  /** @internal */ _stats: HistoryEvent[];
  /** @internal */ _items: Renames = { _seq_: 1 };
  /** @internal */ _threads: Renames = { _seq_: "A" };

  constructor(stats: HistoryEvent[]) {
    this._stats = stats;
  }

  show(): void {
    puts.call($stdout, "Job History:");
    this.stats.forEach((stat) => {
      stat.data ??= {};
      this.rename(stat, "thread", this.threads);
      this.rename(stat.data, "item_id", this.items);
      this.rename(stat.data, "new_thread", this.threads);
      this.rename(stat.data, "deleted_thread", this.threads);
      printf.call(
        $stdout,
        "%8d %2s %-20s %s\n",
        Math.round(stat.time * 1_000_000),
        stat.thread,
        stat.event,
        Object.entries(stat.data)
          .map(([k, v]) => `${k}:${v}`)
          .join(" "),
      );
    });
  }

  /** @internal */
  private rename(hash: object, key: string, renames: Renames): void {
    const h = hash as Record<string, string | number>;
    if (h[key] != null) {
      const original = h[key];
      let value = renames[original];
      if (value == null) {
        value = renames._seq_;
        renames._seq_ = typeof value === "number" ? value + 1 : succ(value);
        renames[original] = value;
      }
      h[key] = value;
    }
  }
}

include(ThreadHistoryDisplay, PrivateReader);
(ThreadHistoryDisplay as unknown as { privateReader(...names: string[]): void }).privateReader(
  "stats",
  "items",
  "threads",
);
