import { env as ENV, File, FileUtils, getHttpAsync } from "@blazetrails/ruby-compat";
import { describe, expect, it, vi } from "vitest";
import { ViteAssets } from "../lib/vite-assets.js";
import { refreshConfig } from "./support/test-helper.js";

const exposed = () =>
  ViteAssets.instance() as unknown as { devServerMeta(): Promise<Record<string, unknown>> };

async function writeMetaFile(meta: Record<string, unknown>): Promise<void> {
  const path = (await ViteAssets.config()).devServerMetaPath();
  await FileUtils.mkdirPAsync(File.dirname(path.toString()));
  await path.write(JSON.stringify(meta));
}

async function removeMetaFile(): Promise<void> {
  const path = (await ViteAssets.config()).devServerMetaPath();
  if (await File.isExistAsync(path.toString())) await path.delete();
}

async function withoutCi(block: () => Promise<void>): Promise<void> {
  const mutableEnv = ENV as Record<string, string | undefined>;
  const ci = mutableEnv["CI"];
  delete mutableEnv["CI"];
  try {
    await block();
  } finally {
    if (ci !== undefined) mutableEnv["CI"] = ci;
  }
}

async function stubConnect(connect: () => unknown, block: () => Promise<void>): Promise<void> {
  const http = (await getHttpAsync()) as unknown as { connect: () => unknown };
  const spy = vi.spyOn(http, "connect").mockImplementation(connect);
  try {
    await block();
  } finally {
    spy.mockRestore();
  }
}

describe("DevServerTest", () => {
  it("not running without meta file", async () => {
    await refreshConfig({ mode: "development" });
    await removeMetaFile();

    expect(await ViteAssets.instance().isDevServerRunning()).toBe(false);
  });

  it("running with meta file", async () => {
    await refreshConfig({ mode: "development" });
    try {
      await writeMetaFile({
        url: "http://localhost:3535",
        host: "localhost",
        port: (await ViteAssets.config()).port,
        https: false,
        pid: 1234,
      });

      expect(await ViteAssets.instance().isDevServerRunning()).toBe(true);
      expect((await exposed().devServerMeta())["url"]).toBe("http://localhost:3535");
    } finally {
      await removeMetaFile();
    }
  });

  it("development meta does not mark test server as running", async () => {
    try {
      await refreshConfig({ mode: "test" });
      await removeMetaFile();
      const testPort = (await ViteAssets.config()).port;
      await refreshConfig({ mode: "development", port: testPort });
      await writeMetaFile({ port: testPort });

      await refreshConfig({ mode: "test" });

      await withoutCi(async () => {
        expect(await ViteAssets.instance().isDevServerRunning()).toBe(false);
      });
    } finally {
      if ((await ViteAssets.config()).mode === "test") await removeMetaFile();
      await refreshConfig({ mode: "development" });
      await removeMetaFile();
    }
  });

  it("running with test meta file", async () => {
    await refreshConfig({ mode: "test" });
    try {
      await writeMetaFile({ port: (await ViteAssets.config()).port });

      await withoutCi(async () => {
        expect(await ViteAssets.instance().isDevServerRunning()).toBe(true);
      });
    } finally {
      await removeMetaFile();
    }
  });

  it("not running when meta port does not match", async () => {
    await refreshConfig({ mode: "development" });
    try {
      await writeMetaFile({ port: (await ViteAssets.config()).port + 1 });

      expect(await ViteAssets.instance().isDevServerRunning()).toBe(false);
    } finally {
      await removeMetaFile();
    }
  });

  it("not running with invalid meta shape", async () => {
    await refreshConfig({ mode: "development" });
    try {
      const path = (await ViteAssets.config()).devServerMetaPath();
      await FileUtils.mkdirPAsync(File.dirname(path.toString()));
      await path.write(JSON.stringify("not a metadata object"));

      expect(await ViteAssets.instance().isDevServerRunning()).toBe(false);
    } finally {
      await removeMetaFile();
    }
  });

  it("not running in production", async () => {
    await refreshConfig({ mode: "production" });
    try {
      await writeMetaFile({ url: "http://localhost:3036" });

      expect(await ViteAssets.instance().isDevServerRunning()).toBe(false);
    } finally {
      await removeMetaFile();
    }
  });

  it("connection check ignores meta file when socket refused", async () => {
    await refreshConfig({ mode: "development", devServerConnectionCheck: true });
    try {
      await writeMetaFile({ url: "http://localhost:3036" });

      await stubConnect(
        () => Promise.reject(new Error("ECONNREFUSED")),
        async () => {
          expect(await ViteAssets.instance().isDevServerRunning()).toBe(false);
        },
      );
    } finally {
      await removeMetaFile();
    }
  });

  it("connection check reports running when socket connects", async () => {
    await refreshConfig({ mode: "development", devServerConnectionCheck: true });
    await removeMetaFile();

    await stubConnect(
      () => Promise.resolve({ close() {} }),
      async () => {
        expect(await ViteAssets.instance().isDevServerRunning()).toBe(true);
      },
    );
  });
});
