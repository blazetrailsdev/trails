import { setEnv } from "@blazetrails/ruby-compat";
import { vi } from "vitest";
import type { Config } from "../../lib/config.js";
import { Build } from "../../lib/build.js";
import { Builder } from "../../lib/builder.js";
import { ViteAssets } from "../../lib/vite-assets.js";

setEnv("VITE_RUBY_SKIP_COMPATIBILITY_CHECK", "true");

let railsEnv = "production";

export function railsEnvName(): string {
  return railsEnv;
}

export function pathToTestApp(): string {
  return new URL("../test_app", import.meta.url).pathname;
}

export function refreshConfig(options: Record<string, unknown> = {}): Promise<Config> {
  return ViteAssets.reloadWith({ root: pathToTestApp(), mode: railsEnv, ...options }).config();
}

export async function withRailsEnv(env: string, block: (config: Config) => unknown): Promise<void> {
  const original = railsEnv;
  try {
    railsEnv = env;
    await refreshConfig();
    await block(await ViteAssets.config());
  } finally {
    railsEnv = original;
    await refreshConfig();
  }
}

export async function withDevServerRunning(block: () => unknown): Promise<void> {
  const spy = vi.spyOn(ViteAssets.instance(), "isDevServerRunning").mockResolvedValue(true);
  try {
    await block();
  } finally {
    spy.mockRestore();
  }
}

export class MockProcessStatus {
  /** @internal */
  private readonly _success: boolean;

  constructor({ success = true }: { success?: boolean } = {}) {
    this._success = success;
  }

  isSuccess(): boolean {
    return this._success;
  }
}

export async function stubBuilder(
  {
    buildErrors = "",
    buildSuccessful = buildErrors === "",
    stale = false,
  }: { buildErrors?: string; buildSuccessful?: boolean; stale?: boolean } = {},
  block: () => unknown,
): Promise<void> {
  const fromPrevious = Build.fromPrevious;
  const spies = [
    vi.spyOn(Build, "fromPrevious").mockImplementation(async (...args) => {
      const build = await fromPrevious.apply(Build, args);
      build.success = buildSuccessful;
      build.errors = buildErrors;
      build.isStale = () => stale;
      return build;
    }),
    vi
      .spyOn(Builder.prototype as unknown as { buildWithVite(): unknown }, "buildWithVite")
      .mockResolvedValue([
        "stdout",
        buildErrors,
        new MockProcessStatus({ success: buildSuccessful }),
      ]),
  ];
  try {
    await block();
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}
