import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DetailsKey } from "@blazetrails/actionview";
import { Dir, env, setEnv } from "@blazetrails/ruby-compat";
import type { BuildViewsResult, WatchViewsOptions } from "@blazetrails/trails-tsc";
import { Application } from "../../lib/application.js";
import { Trails, _resetTrailsEnv } from "../../lib/trails.js";
import "../../lib/trailties/action-view.js";
import * as TrailsTsc from "@blazetrails/trails-tsc";

const viewWatches = vi.hoisted(() => [] as WatchViewsOptions[]);
const watchState = vi.hoisted(() => ({ initialError: null as Error | null, closed: 0 }));
vi.mock("@blazetrails/trails-tsc", () => ({
  watchViews: async (opts: WatchViewsOptions) => {
    viewWatches.push(opts);
    if (watchState.initialError) opts.onError!(watchState.initialError);
    return {
      close() {
        watchState.closed++;
      },
    };
  },
}));

Trails.TrailsTsc = TrailsTsc;

describe("ActionView railtie server block (trails)", () => {
  const trailsEnv = env.TRAILS_ENV;
  let appPath: string;

  beforeEach(async () => {
    appPath = await mkdtemp(join(tmpdir(), "trails-av-server-"));
    await mkdir(join(appPath, "config"));
    await writeFile(join(appPath, "config.ts"), "");
    viewWatches.length = 0;
    watchState.initialError = null;
    watchState.closed = 0;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    Trails.logger = null;
    setEnv("TRAILS_ENV", trailsEnv);
    _resetTrailsEnv();
    await rm(appPath, { recursive: true, force: true });
  });

  async function app(
    trailsEnv: string,
    cacheTemplateLoading: boolean | null,
  ): Promise<Application> {
    setEnv("TRAILS_ENV", trailsEnv);
    _resetTrailsEnv();
    class A extends Application {}
    Application.register(A, appPath);
    const application = A.instance();
    await application.root();
    application.config.enableReloading = trailsEnv === "development";
    application.config.actionView.cacheTemplateLoading = cacheTemplateLoading;
    return application;
  }

  it("watches app/views when template caching is off", async () => {
    await (await app("development", null)).loadServer();

    expect(viewWatches.map((o) => o.cwd)).toEqual([Dir.pwd()]);
  });

  it("loads templates once from the build when template caching is on", async () => {
    await (await app("production", null)).loadServer();
    await (await app("development", true)).loadServer();

    expect(viewWatches).toEqual([]);
  });

  it("refuses to boot when the initial view build fails", async () => {
    const errors: string[] = [];
    Trails.logger = { error: (m: string) => errors.push(m) } as never;
    watchState.initialError = new Error("bad view");

    await expect((await app("development", null)).loadServer()).rejects.toThrow("bad view");
    expect(watchState.closed).toBe(1);
    expect(errors).toEqual(["trails-tsc-views: build: bad view"]);
  });

  it("clears the template caches on a rebuild, not on the initial build", async () => {
    await (await app("development", null)).loadServer();
    const clear = vi.spyOn(DetailsKey, "clear");

    viewWatches[0].onRebuild!({ kind: "initial", result: { count: 0 } as BuildViewsResult });
    expect(clear).not.toHaveBeenCalled();
    viewWatches[0].onRebuild!({
      kind: "change",
      trigger: "a.html.tse",
      result: { count: 1 } as BuildViewsResult,
    });
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
