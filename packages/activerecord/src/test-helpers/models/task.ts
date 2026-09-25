import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Base } from "../../base.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- a generated attribute accessor's reader and writer types differ (CLAUDE.md, "Generated attribute readers are properties"); a class body cannot hold a bodiless accessor, so the pair lives in an interface that merges with the class. */
export interface Task {
  get starting(): RubyTime | null;
  set starting(value: unknown);
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the reader/writer accessor pair for this model's generated attributes lives in the interface merged above. */
export class Task extends Base {
  declare ending: RubyTime | Temporal.PlainDateTime;

  get updatedAt() {
    return this.readAttribute("ending");
  }
}
