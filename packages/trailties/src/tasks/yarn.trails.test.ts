import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rake } from "@blazetrails/rake";
import {
  Errno,
  File,
  STDERR,
  childProcessAdapterConfig,
  rbFLoad,
  registerChildProcessAdapter,
  setExitCode,
} from "@blazetrails/ruby-compat";

describe("tasks/yarn", () => {
  let previousAdapter: typeof childProcessAdapterConfig.adapter;
  let version: { error?: Error; stdout: string };
  let commands: string[];

  async function install(): Promise<void> {
    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "yarn.ts"));
      await rake.lookup("yarn:install")!.invoke();
    });
  }

  beforeEach(() => {
    commands = [];
    registerChildProcessAdapter("yarn-task-test", {
      spawnSync() {
        return { status: 0, signal: null, stdout: "", stderr: "" };
      },
      async capture3() {
        return [version.stdout, "", { pid: 1, status: 0, signal: null, error: version.error }];
      },
      async system(cmd: string, _env: unknown, args?: string[]) {
        commands.push([cmd, ...(args ?? [])].join(" "));
        return { pid: 1, status: 0, signal: null };
      },
    } as never);
    previousAdapter = childProcessAdapterConfig.adapter;
    childProcessAdapterConfig.adapter = "yarn-task-test";
  });

  afterEach(() => {
    childProcessAdapterConfig.adapter = previousAdapter;
    vi.restoreAllMocks();
    setExitCode(0);
  });

  it("installs with the flags of the yarn version", async () => {
    version = { stdout: "4.1.0\n" };
    await install();
    expect(commands.join()).toContain("yarn install --immutable");
  });

  it("reports a missing yarn", async () => {
    version = { stdout: "", error: new Errno.ENOENT("yarn") };
    const puts = vi.spyOn(STDERR, "puts").mockReturnValue(null);

    await expect(install()).rejects.toBeDefined();

    expect(puts).toHaveBeenCalledWith("yarn install failed to execute.");
  });
});
