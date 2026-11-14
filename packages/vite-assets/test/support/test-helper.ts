import { vi } from "vitest";
import type { Config } from "../../lib/config.js";
import type { LastBuild } from "../../lib/missing-entrypoint-error.js";
import { ViteAssets } from "../../lib/vite-assets.js";

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

export async function stubBuilder(
  {
    buildErrors = "",
    buildSuccessful = buildErrors === "",
  }: { buildErrors?: string; buildSuccessful?: boolean } = {},
  block: () => unknown,
): Promise<void> {
  const lastBuild: LastBuild = {
    success: buildSuccessful,
    errors: buildErrors,
    toJson: () => JSON.stringify({ success: buildSuccessful, errors: buildErrors }),
  };
  const spy = vi.spyOn(ViteAssets.instance(), "builder").mockReturnValue({
    build: async () => buildSuccessful,
    lastBuildMetadata: async () => lastBuild,
  });
  try {
    await block();
  } finally {
    spy.mockRestore();
  }
}
