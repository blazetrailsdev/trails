import { osAdapterConfig, registerOsAdapter } from "@blazetrails/activesupport";
import { getFsAsync } from "@blazetrails/activesupport/fs-adapter";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_FORKS, resolveForkCount } from "./ar-db-forks-default.js";
import { workerForkCount } from "./ar-db-slots.js";

// vitest.config.ts sizes the real fork pool (`poolOptions.forks.maxForks`) and
// ar-db-slots.ts sizes the advisory-slot pool; both need the same effective
// worker count, but the config is loaded before any workspace package is built
// and so cannot import the activesupport-backed module. They share
// resolveForkCount() from the dependency-free ar-db-forks-default.ts — this
// file is the guard that keeps them there: the matrix pins workerForkCount()
// to the shared helper across the precedence combinations, and the source
// check fails if the config re-inlines its own parse/clamp instead of calling
// the helper (the drift that PR #5243's first review round caught by hand).
//
// The config is checked as source rather than imported: it sits outside this
// package's tsconfig rootDir and is CommonJS importing ESM-only
// `vitest/config`, so `tsc --build` cannot take it into the program.

const CONFIG_PATH = decodeURIComponent(
  new URL("../../../../vitest.config.ts", import.meta.url).pathname,
);

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
  for (const k of ENV_KEYS) saved.set(k, process.env[k]);

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
      // What vitest.config.ts computes: the shared helper against its own
      // host reading (node os), pinned here to the same core count.
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
    const fs = await getFsAsync();
    const source = await fs.readFile!(CONFIG_PATH, "utf8");
    const code = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");

    expect(code).toContain("const TEST_FORKS = resolveForkCount(process.env, _hostForkCap);");
    expect(code).toContain("const _hostForkCap = Math.max(os.availableParallelism() - 1, 1);");
    expect(code).toContain("poolOptions: { forks: { maxForks: TEST_FORKS } }");
    // The env vars may only be named inside the shared helper; a re-inlined
    // parse here is exactly the drift this test exists to catch.
    expect(code).not.toContain("process.env.TRAILS_TEST_FORKS");
    expect(code).not.toContain("process.env.AR_DB_FORKS");
  });
});
