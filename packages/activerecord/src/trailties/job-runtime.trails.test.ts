import { describe, it, expect, vi } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { JobRuntime } from "./job-runtime.js";

describe("JobRuntime#instrument", () => {
  it("delegates both arms to the host's instrument", async () => {
    class Host {
      instrument(
        _operation: string,
        _payload: Record<string, unknown> = {},
        block?: () => unknown,
      ) {
        return block?.();
      }
    }
    const spy = vi.spyOn(Host.prototype, "instrument");
    class Job extends Host {}
    include(Job, JobRuntime);

    await new Job().instrument("perform", {}, () => "done");
    new Job().instrument("enqueue", {}, () => 1);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(["perform", "enqueue"]);
  });
});
