import { osAdapterConfig, registerOsAdapter } from "@blazetrails/activesupport";
import { getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_FORKS, resolveForkCount } from "../support/ar-db-forks-default.js";
import { workerForkCount } from "../support/ar-db-slots.js";

const sourcePath = (relative: string): string =>
  decodeURIComponent(new URL(relative, import.meta.url).pathname);

const CONFIG_PATH = sourcePath("../../../../vitest.config.ts");
const HELPER_PATH = sourcePath("./ar-db-forks-default.ts");

async function readSource(path: string): Promise<string> {
  const fs = await getFsAsync();
  if (!fs.readFile) throw new Error("fs adapter has no async readFile");
  return fs.readFile(path, "utf8");
}

function stripComments(source: string): string {
  // Line-based on purpose: a `/* ... */` sweep would swallow the config's
  // glob strings ("packages/*/dx-tests/**") along with the code between them.
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");
}

let cores = 64;
const HOST_CORES = 64;

const ENV_KEYS = ["TRAILS_TEST_FORKS", "AR_DB_FORKS"] as const;

describe("ar-db fork count parity", () => {
  beforeAll(() => {
    registerOsAdapter("ar-db-forks-parity-test", {
      tmpdir: () => "/tmp",
      platform: () => "linux",
      cwd: () => "/",
      availableParallelism: () => cores,
    });
    osAdapterConfig.adapter = "ar-db-forks-parity-test";
  });

  afterAll(() => {
    osAdapterConfig.adapter = null;
  });

  const saved = new Map<string, string | undefined>();

  beforeAll(() => {
    for (const k of ENV_KEYS) saved.set(k, process.env[k]);
  });

  afterEach(() => {
    cores = HOST_CORES;
    for (const k of ENV_KEYS) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function setEnv(env: Record<string, string>): void {
    for (const k of ENV_KEYS) delete process.env[k];
    Object.assign(process.env, env);
  }

  const matrix: Array<{ name: string; env: Record<string, string>; expected: number }> = [
    { name: "neither var set", env: {}, expected: DEFAULT_FORKS },
    { name: "AR_DB_FORKS only", env: { AR_DB_FORKS: "3" }, expected: 3 },
    { name: "TRAILS_TEST_FORKS only", env: { TRAILS_TEST_FORKS: "2" }, expected: 2 },
    {
      name: "both set — TRAILS_TEST_FORKS wins",
      env: { TRAILS_TEST_FORKS: "2", AR_DB_FORKS: "8" },
      expected: 2,
    },
    {
      name: "non-numeric falls back to the default",
      env: { AR_DB_FORKS: "auto" },
      expected: DEFAULT_FORKS,
    },
  ];

  for (const { name, env, expected } of matrix) {
    it(`workerForkCount() matches the config's fork count: ${name}`, () => {
      setEnv(env);
      const configForks = resolveForkCount(process.env, Math.max(cores - 1, 1));
      expect(configForks).toBe(expected);
      expect(workerForkCount()).toBe(configForks);
    });
  }

  it("clamps both sides to the host ceiling of cores - 1", () => {
    cores = 4;
    setEnv({ AR_DB_FORKS: "8" });
    const configForks = resolveForkCount(process.env, Math.max(cores - 1, 1));
    expect(configForks).toBe(3);
    expect(workerForkCount()).toBe(configForks);
  });

  it("clamps both sides to at least one worker on a single-core host", () => {
    cores = 1;
    setEnv({});
    const configForks = resolveForkCount(process.env, Math.max(cores - 1, 1));
    expect(configForks).toBe(1);
    expect(workerForkCount()).toBe(configForks);
  });

  it("vitest.config.ts derives maxForks from the shared helper, not its own parse", async () => {
    const code = stripComments(await readSource(CONFIG_PATH));

    expect(code).toMatch(
      /import\s*\{[^}]*\bresolveForkCount\b[^}]*\}\s*from\s*"[^"]*ar-db-forks-default\.js"/,
    );
    expect(code).toMatch(/const\s+TEST_FORKS\s*=\s*resolveForkCount\(\s*process\.env\s*,/);
    expect(code).toMatch(/maxForks:\s*TEST_FORKS\b/);
    expect(code).toMatch(/Math\.max\(\s*os\.availableParallelism\(\)\s*-\s*1\s*,\s*1\s*\)/);
    expect(code).not.toMatch(/\bTRAILS_TEST_FORKS\b/);
    expect(code).not.toMatch(/\bAR_DB_FORKS\b/);
  });

  it("the shared helper module imports nothing, so the config can load it unbuilt", async () => {
    const code = stripComments(await readSource(HELPER_PATH));

    expect(code).not.toMatch(/^\s*import\b/m);
    expect(code).not.toMatch(/\brequire\(/);
  });
});
