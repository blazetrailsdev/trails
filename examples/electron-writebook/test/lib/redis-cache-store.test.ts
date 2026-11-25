import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../test-helper.ts";

const root = join(import.meta.dirname, "../..");

describe("RedisCacheStoreTest", () => {
  it("production's cache store connects to REDIS_URL", () => {
    const env = {
      ...process.env,
      TRAILS_ENV: "production",
      SECRET_KEY_BASE_DUMMY: "1",
      REDIS_URL: "redis://redis.example:6390/3",
    };
    const { stdout, stderr, status } = spawnSync(
      "bin/trails",
      [
        "runner",
        "const { host, port, db } = await Trails.cache.redis.use(async (it) => it.options); process.stdout.write(`redis://${host}:${port}/${db}`)",
      ],
      { cwd: root, env, encoding: "utf8" },
    );
    const output = stdout + stderr;

    expect(status, output).toBe(0);
    expect(stdout.split("\n").at(-1)).toBe("redis://redis.example:6390/3");
  }, 60_000);
});
