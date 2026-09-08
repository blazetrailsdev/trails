import { describe, it, expect, afterEach } from "vitest";
import { SystemExit, env, setEnv } from "@blazetrails/ruby-compat";
import { AbstractAdapter } from "./abstract-adapter.js";

describe("AbstractAdapter.findCmdAndExec", () => {
  const originalPath = env["PATH"];

  afterEach(() => {
    setEnv("PATH", originalPath);
  });

  it("returns the first command found on $PATH, joined to its directory", () => {
    setEnv("PATH", ["/nonexistent-dir", "/bin", "/usr/bin"].join(":"));
    const [cmd, ...args] = AbstractAdapter.findCmdAndExec(["no-such-client", "sh"], "-c", "true");
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
