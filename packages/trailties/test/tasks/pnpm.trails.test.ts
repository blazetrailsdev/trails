import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Rake } from "@blazetrails/rake";
import {
  childProcessAdapterConfig,
  registerChildProcessAdapter,
} from "@blazetrails/ruby-compat/child-process-adapter";
import { Errno } from "@blazetrails/ruby-compat/errno";
import { File } from "@blazetrails/ruby-compat/file";
import { STDERR } from "@blazetrails/ruby-compat/io";
import { rbFLoad } from "@blazetrails/ruby-compat/load";
import { setExitCode } from "@blazetrails/ruby-compat/process-adapter";

describe("tasks/pnpm", () => {
  let previousAdapter: typeof childProcessAdapterConfig.adapter;
  let error: Error | undefined;
  let commands: string[];

  async function install(): Promise<void> {
    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "../../lib/tasks/pnpm.ts"));
      await rake.lookup("pnpm:install")!.invoke();
    });
  }

  beforeEach(() => {
    commands = [];
    registerChildProcessAdapter("pnpm-task-test", {
      spawnSync() {
        return { status: 0, signal: null, stdout: "", stderr: "" };
      },
      async system(cmd: string, _env: unknown, args?: string[]) {
        commands.push([cmd, ...(args ?? [])].join(" "));
        return { pid: 1, status: error ? 127 : 0, signal: null, error };
      },
    });
    previousAdapter = childProcessAdapterConfig.adapter;
    childProcessAdapterConfig.adapter = "pnpm-task-test";
  });

  afterEach(() => {
    childProcessAdapterConfig.adapter = previousAdapter;
    vi.restoreAllMocks();
    setExitCode(0);
  });

  it("installs from the frozen lockfile", async () => {
    error = undefined;
    await install();
    expect(commands.join()).toContain("pnpm install --frozen-lockfile");
  });

  it("reports a missing pnpm", async () => {
    error = new Errno.ENOENT("pnpm");
    (error as { code?: string }).code = "ENOENT";
    const puts = vi.spyOn(STDERR, "puts").mockReturnValue(null);

    await expect(install()).rejects.toBeDefined();

    expect(puts).toHaveBeenCalledWith("pnpm install failed to execute.");
  });
});
