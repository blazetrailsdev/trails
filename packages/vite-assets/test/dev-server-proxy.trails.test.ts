import { afterEach, describe, expect, it } from "vitest";
import { DevServerProxy } from "../lib/dev-server-proxy.js";
import { ViteAssets } from "../lib/vite-assets.js";
import { refreshConfig, withRailsEnv } from "./support/test-helper.js";

const streaming = (proxy: DevServerProxy) => (proxy as unknown as { streaming: unknown }).streaming;

describe("DevServerProxy streaming default", () => {
  afterEach(() => refreshConfig());

  it("turns streaming off in test mode when the option is not given", async () => {
    await withRailsEnv("test", () => {
      expect(streaming(new DevServerProxy(null))).toBe(false);
      expect(streaming(new DevServerProxy(null, { streaming: true }))).toBe(true);
    });
  });

  it("keeps streaming on outside test mode", async () => {
    await refreshConfig();
    expect(streaming(new DevServerProxy(null))).toBe(true);
  });

  it("applies the test-mode default on a ViteAssets whose config is not yet resolved", () => {
    expect(
      streaming(new DevServerProxy(null, { viteRuby: new ViteAssets({ mode: "test" }) })),
    ).toBe(false);
    expect(
      streaming(new DevServerProxy(null, { viteRuby: new ViteAssets({ mode: "development" }) })),
    ).toBe(true);
  });
});
