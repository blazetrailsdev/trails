import { Digest, File, FileUtils, Pathname, setEnv } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Build } from "../lib/build.js";
import { IO } from "../lib/io.js";
import { MissingExecutableError } from "../lib/missing-executable-error.js";
import { ViteAssets } from "../lib/vite-assets.js";
import { MockProcessStatus, pathToTestApp, refreshConfig } from "./support/test-helper.js";

const WATCHED_FILE = "app/frontend/entrypoints/application.js";

type Exposed = { lastBuildPath(options: { ssr: boolean }): Promise<Pathname> };
const builder = () => ViteAssets.instance().builder();
const manifest = () =>
  ViteAssets.instance().manifest() as unknown as { lookup(name: string): Promise<unknown> };
const lastBuild = () => builder().lastBuildMetadata();
const lastBuildPath = (ssr: boolean) => (builder() as unknown as Exposed).lastBuildPath({ ssr });
const viteEnv = async (vars?: Record<string, string>) => (await ViteAssets.config()).toEnv(vars);
const watchedFile = () => new Pathname(pathToTestApp()).join(WATCHED_FILE);

async function hashedFiles(block: () => unknown): Promise<string[]> {
  const files: string[] = [];
  const original = Digest.SHA1.file.bind(Digest.SHA1);
  const spy = vi.spyOn(Digest.SHA1, "file").mockImplementation((file) => {
    files.push(String(file).slice(pathToTestApp().length + 1));
    return original(file);
  });
  try {
    await block();
  } finally {
    spy.mockRestore();
  }
  return files;
}

async function stubRunner(
  { errors = "", success = errors === "" }: { errors?: string; success?: boolean },
  block: () => unknown,
): Promise<void> {
  const args = ["stdout", errors, new MockProcessStatus({ success })];
  const spy = vi.spyOn(IO, "capture").mockResolvedValue(args as never);
  try {
    await block();
  } finally {
    spy.mockRestore();
  }
}

async function travel(ms: number, block: () => unknown): Promise<void> {
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + ms });
  try {
    await block();
  } finally {
    vi.useRealTimers();
  }
}

describe("BuilderTest", () => {
  async function setup() {
    await refreshConfig();
    for (const path of [await lastBuildPath(true), await lastBuildPath(false)]) {
      if (await File.isExistAsync(path.toString())) await path.delete();
    }
  }

  beforeEach(setup);
  afterEach(setup);

  it("custom environment variables", async () => {
    expect((await viteEnv())["FOO"]).toBeUndefined();
    ViteAssets.env()["FOO"] = "BAR";

    expect((await viteEnv())["FOO"]).toBe("BAR");
    expect((await viteEnv({ FOO: "OTHER" }))["FOO"]).toBe("OTHER");
  });

  it("freshness", async () => {
    expect((await lastBuild()).isStale()).toBe(true);
    expect((await lastBuild()).isFresh()).toBe(false);
  });

  it("freshness on build success", async () => {
    expect((await lastBuild()).isStale()).toBe(true);
    await stubRunner({ success: true }, async () => {
      expect(await builder().build()).toBe(true);
      expect((await lastBuild()).success).toBe(true);
      expect((await lastBuild()).errors).toBe("");
      expect((await lastBuild()).isFresh()).toBe(true);
      expect((await lastBuild()).digest).toBeTruthy();
      expect((await lastBuild()).timestamp).toBeTruthy();

      await refreshConfig({ autoBuild: true });

      expect(await manifest().lookup("app.css")).not.toBeNull();
    });
  });

  it("freshness on build fail", async () => {
    expect((await lastBuild()).isStale()).toBe(true);
    const errorMessage = "SyntaxError: Hero.jsx: Unexpected token (6:6)";
    await stubRunner({ errors: errorMessage }, async () => {
      expect(await builder().build()).toBe(false);
      expect((await lastBuild()).success).toBe(false);
      expect((await lastBuild()).errors).toBe(errorMessage);
      expect((await lastBuild()).isFresh()).toBe(true);
      expect((await lastBuild()).digest).toBeTruthy();
      expect((await lastBuild()).timestamp).toBeTruthy();

      await refreshConfig({ autoBuild: true });

      expect(await manifest().lookup("app.css")).toBeNull();
    });
  });

  it("last build path", async () => {
    const mode = await ViteAssets.mode();
    expect(File.basename((await lastBuildPath(false)).toString())).toBe(`last-build-${mode}.json`);
    expect(File.basename((await lastBuildPath(true)).toString())).toBe(
      `last-ssr-build-${mode}.json`,
    );
  });

  it("watched files digest", async () => {
    const previousDigest = await ViteAssets.digest();
    await refreshConfig();

    expect(await ViteAssets.digest()).toBe(previousDigest);
  });

  it("watched files digest reads changed files only", async () => {
    const previousDigest = await ViteAssets.digest();

    await travel(60_000, async () => {
      expect(
        await hashedFiles(async () => expect(await ViteAssets.digest()).toBe(previousDigest)),
      ).toEqual([]);
    });

    await FileUtils.touchAsync(watchedFile().toString());

    await travel(120_000, async () => {
      expect(
        await hashedFiles(async () => expect(await ViteAssets.digest()).toBe(previousDigest)),
      ).toEqual([WATCHED_FILE]);
    });
  });

  it("watched files digest detects changed contents", async () => {
    const previousDigest = await ViteAssets.digest();
    const contents = await watchedFile().read();

    try {
      await travel(60_000, async () => {
        await watchedFile().write(`${contents}\n// Changed`);

        expect(await ViteAssets.digest()).not.toBe(previousDigest);
      });
    } finally {
      await watchedFile().write(contents);
    }
  });

  it("external env variables", async () => {
    expect((await viteEnv())["VITE_RUBY_MODE"]).toBe("production");
    expect((await viteEnv())["VITE_RUBY_ROOT"]).toBe(pathToTestApp());

    try {
      setEnv("VITE_RUBY_MODE", "foo.bar");
      setEnv("VITE_RUBY_ROOT", "/baz");
      await ViteAssets.reloadWith().config();

      expect((await viteEnv())["VITE_RUBY_MODE"]).toBe("foo.bar");
      expect((await viteEnv())["VITE_RUBY_ROOT"]).toBe("/baz");
    } finally {
      setEnv("VITE_RUBY_MODE", undefined);
      setEnv("VITE_RUBY_ROOT", undefined);
      await refreshConfig();
    }
  });

  it("missing executable", async () => {
    await refreshConfig({ viteBinPath: "none/vite" });

    const spy = vi.spyOn(File, "isExistAsync").mockResolvedValue(true);
    let error: unknown;
    try {
      error = await builder()
        .build()
        .then(
          () => null,
          (e: unknown) => e,
        );
    } finally {
      spy.mockRestore();
    }
    expect(error).toBeInstanceOf(MissingExecutableError);

    expect((error as MissingExecutableError).message).toMatch("The vite binary is not available.");

    await stubRunner({ success: true }, async () => expect(await builder().build()).toBe(true));
  });

  it("build cache", async () => {
    const build = await Build.fromPrevious(new Pathname(import.meta.filename), "digest");

    expect(build.timestamp).toBe("never");
    expect(build.isRetryFailed()).toBe(true);
  });
});
