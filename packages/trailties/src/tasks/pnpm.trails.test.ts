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

describe("tasks/pnpm", () => {
  let previousAdapter: typeof childProcessAdapterConfig.adapter;
  let error: Error | undefined;
  let commands: string[];

  async function install(): Promise<void> {
    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "pnpm.ts"));
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
    } as never);
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
    error = new Errno.ENOENT("pnpm") as Error;
    (error as { code?: string }).code = "ENOENT";
    const puts = vi.spyOn(STDERR, "puts").mockReturnValue(null);

    await expect(install()).rejects.toBeDefined();

    expect(puts).toHaveBeenCalledWith("pnpm install failed to execute.");
  });
});
