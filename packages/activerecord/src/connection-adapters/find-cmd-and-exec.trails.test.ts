import { describe, it, expect, afterEach, vi } from "vitest";
import { SystemExit, env, getProcessAdapter, setEnv } from "@blazetrails/ruby-compat";
import { AbstractAdapter } from "./abstract-adapter.js";

describe("AbstractAdapter.findCmdAndExec", () => {
  const originalPath = env["PATH"];

  afterEach(() => {
    setEnv("PATH", originalPath);
    vi.restoreAllMocks();
  });

  it("execs the first command found on $PATH, joined to its directory", () => {
    const adapter = getProcessAdapter() as { exec(argv: readonly string[]): never };
    const exec = vi.spyOn(adapter, "exec").mockReturnValue(undefined as never);
    setEnv("PATH", ["/nonexistent-dir", "/bin", "/usr/bin"].join(":"));
    AbstractAdapter.findCmdAndExec(["no-such-client", "sh"], "-c", "true");
    const [cmd, ...args] = exec.mock.calls[0][0];
    expect(cmd).toMatch(/^\/(usr\/)?bin\/sh$/);
    expect(args).toEqual(["-c", "true"]);
  });

  it("skips a name on $PATH that is a directory rather than an executable file", () => {
    setEnv("PATH", "/");
    expect(() => AbstractAdapter.findCmdAndExec("bin")).toThrow(SystemExit);
  });

  it("aborts when nothing on $PATH is executable", () => {
    setEnv("PATH", "/nonexistent-dir");
    expect(() => AbstractAdapter.findCmdAndExec(["mysql", "mysql2"])).toThrow(SystemExit);
    expect(() => AbstractAdapter.findCmdAndExec(["mysql", "mysql2"])).toThrow(
      "Couldn't find database client: mysql, mysql2. Check your $PATH and try again.",
    );
  });
});
