import { exec } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Runner } from "../lib/runner.js";
import { ViteAssets } from "../lib/vite-assets.js";
import { refreshConfig, withRailsEnv } from "./support/test-helper.js";

vi.mock("@blazetrails/ruby-compat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@blazetrails/ruby-compat")>()),
  exec: vi.fn(),
}));

async function assertRunCommand(argv: string[], { flags = [] as string[] } = {}) {
  vi.mocked(exec).mockClear();
  await ViteAssets.run(argv, { exec: true });
  const [executable, ...rest] = vi.mocked(exec).mock.calls[0];
  if (/node_modules\/.bin\/vite/.test(executable)) {
    expect(rest).toEqual([...argv, ...flags]);
  } else {
    expect([executable, ...rest]).toEqual(["yarn", "vite", ...argv, ...flags]);
  }
}

describe("RunnerTest", () => {
  beforeEach(() => refreshConfig());
  afterEach(() => refreshConfig());

  it("dev server command", async () => {
    await assertRunCommand([], { flags: ["--mode", "production"] });
  });

  it("dev server command with argument", async () => {
    await assertRunCommand(["--quiet"], { flags: ["--mode", "production"] });
  });

  it("build command", async () => {
    await assertRunCommand(["build"], { flags: ["--mode", "production"] });
  });

  it("build command with argument", async () => {
    await withRailsEnv("development", async () => {
      await assertRunCommand(["build", "--emptyOutDir"], { flags: ["--mode", "development"] });
    });
  });

  it("command capture", async () => {
    const spy = vi
      .spyOn(Runner.prototype as unknown as { viteExecutable(): unknown }, "viteExecutable")
      .mockResolvedValue(["echo"]);
    try {
      const [stdout, stderr, status] = (await ViteAssets.run(['"Hello"'])) as [
        string,
        string,
        unknown,
      ];

      expect(stdout).toBe(`"Hello" --mode production\n`);
      expect(stderr).toBe("");
      expect(status).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});
