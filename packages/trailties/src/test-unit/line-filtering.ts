import { rbCallSuper } from "@blazetrails/ruby-compat";
import { Trails } from "../trails.js";
import type { Runner } from "./runner.js";

type Runnable = Parameters<typeof Runner.composeFilter>[0];

/** @internal */
export const LineFiltering = {
  run(this: Runnable, reporter: unknown, options: Record<string, unknown> = {}): unknown {
    options = { ...options, filter: Trails.TestUnit!.Runner.composeFilter(this, options.filter) };

    return rbCallSuper(this, LineFiltering.run, reporter, options);
  },
};
