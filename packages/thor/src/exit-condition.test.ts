import { afterEach, describe, expect, it, vi } from "vitest";
import { Errno, getProcessAdapter, SystemExit } from "@blazetrails/ruby-compat";
import { Thor, type ThorClass } from "./thor.js";

describe("Exit conditions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits 0, not bubble up EPIPE, if EPIPE is raised", async () => {
    vi.spyOn(getProcessAdapter(), "exit").mockImplementation((code) => {
      throw new SystemExit(code ?? 0);
    });
    let epiped = false;

    const command = class extends Thor {
      static {
        (this as unknown as ThorClass).desc("my_action", "testing EPIPE");
        (this as unknown as ThorClass).methodAdded("my_action");
      }
      my_action() {
        epiped = true;
        throw new Errno.EPIPE();
      }
    } as unknown as ThorClass;

    await expect(command.start(["my_action"])).rejects.toThrow(SystemExit);
    expect(epiped).toEqual(true);
  });
});
