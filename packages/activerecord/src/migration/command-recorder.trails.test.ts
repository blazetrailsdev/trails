/**
 * TS-only cases with no counterpart in
 * `activerecord/test/cases/migration/command_recorder_test.rb`.
 */

import { describe, expect, it } from "vitest";
import { CommandRecorder } from "./command-recorder.js";

describe("CommandRecorder", () => {
  it("invertCreateTable strips ifNotExists even when fn is last arg", () => {
    const fn = () => {};
    const [cmd, args] = new CommandRecorder().invertCreateTable([
      "users",
      { ifNotExists: true },
      fn,
    ]);
    expect(cmd).toBe("dropTable");
    expect((args[1] as Record<string, unknown>)["ifNotExists"]).toBeUndefined();
  });

  it("invertRemoveIndex handles array column list without treating it as options", () => {
    const [cmd, args] = new CommandRecorder().invertRemoveIndex(["users", ["email", "name"]]);
    expect(cmd).toBe("addIndex");
    expect(args[1]).toEqual(["email", "name"]);
  });
});
