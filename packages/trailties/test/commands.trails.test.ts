import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  File,
  SystemExit,
  rbAryReplace,
  rbArgv,
  rbFLoad,
  getProcessAdapter,
} from "@blazetrails/ruby-compat";
import { invoke } from "../lib/command.js";

vi.mock("@blazetrails/activesupport/node", () => ({}));
vi.mock("../lib/command.js", () => ({ invoke: vi.fn() }));

describe("trails/commands", () => {
  const load = (...argv: string[]) => {
    rbAryReplace(rbArgv(), argv);
    return rbFLoad(File.join(import.meta.dirname, "commands.ts"));
  };

  beforeEach(() => {
    vi.mocked(invoke).mockReset();
  });

  it("invokes the aliased command with the remaining ARGV", async () => {
    await load("db", "--env", "test");

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("dbconsole", ["--env", "test"]);
  });

  it("invokes an unaliased command by its own name", async () => {
    await load("routes");

    expect(vi.mocked(invoke)).toHaveBeenCalledWith("routes", []);
  });

  it("turns a SystemExit into the exit code", async () => {
    const setExitCode = vi.spyOn(getProcessAdapter(), "setExitCode").mockImplementation(() => {});
    vi.mocked(invoke).mockRejectedValue(new SystemExit(4));

    await load("routes");

    expect(setExitCode).toHaveBeenCalledWith(4);
    setExitCode.mockRestore();
  });
});
