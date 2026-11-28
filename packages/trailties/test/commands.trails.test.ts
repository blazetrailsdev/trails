import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { rbAryReplace } from "@blazetrails/ruby-compat/array";
import { File } from "@blazetrails/ruby-compat/file";
import { rbFLoad } from "@blazetrails/ruby-compat/load";
import { SystemExit, rbArgv, getProcessAdapter } from "@blazetrails/ruby-compat/process-adapter";
import { Handler } from "@blazetrails/rackup";
import { invoke } from "../lib/command.js";

vi.mock("@blazetrails/activesupport/node", () => ({}));
vi.mock("../lib/command.js", () => ({ invoke: vi.fn() }));

describe("trails/commands", () => {
  const load = (...argv: string[]) => {
    rbAryReplace(rbArgv(), argv);
    return rbFLoad(File.join(import.meta.dirname, "../lib/commands.ts"));
  };

  let exit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    exit = vi.spyOn(getProcessAdapter(), "exit").mockImplementation((() => undefined) as never);
    onTestFinished(() => exit.mockRestore());
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

  it("ends the process once the command returns, as bin/rails does", async () => {
    await load("db:migrate");

    expect(exit).toHaveBeenCalledOnce();
  });

  it("does not end the process while the Node handler is serving", async () => {
    const node = (await Handler.get("node")) as typeof Handler.Node;
    node.server = {} as never;
    onTestFinished(() => {
      node.server = null;
    });

    await load("server");

    expect(exit).not.toHaveBeenCalled();
  });
});
