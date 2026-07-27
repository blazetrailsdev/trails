import { osAdapterConfig, registerOsAdapter } from "@blazetrails/activesupport";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_FORKS, slotPoolSize, workerForkCount } from "./ar-db-slots.js";

// workerForkCount() clamps to the host's cores - 1, so every expectation below
// would otherwise depend on the machine running it (a 4-vCPU CI runner clamps
// where a dev box does not). Pin the core count through the OS adapter instead
// and vary it explicitly in the clamp tests.
let cores = 64;
const HOST_CORES = 64;

const ENV_KEYS = ["TRAILS_TEST_FORKS", "AR_DB_FORKS", "AR_DB_SLOTS"] as const;

describe("ar-db-slots", () => {
  beforeAll(() => {
    registerOsAdapter("ar-db-slots-test", {
      tmpdir: () => "/tmp",
      platform: () => "linux",
      cwd: () => "/",
      availableParallelism: () => cores,
    });
    osAdapterConfig.adapter = "ar-db-slots-test";
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

  // TRAILS_TEST_FORKS outranks AR_DB_FORKS, so it has to be cleared for every
  // case that exercises the latter — a dev box may well have it exported.
  function setEnv(forks?: string, slots?: string): void {
    delete process.env.TRAILS_TEST_FORKS;
    if (forks === undefined) delete process.env.AR_DB_FORKS;
    else process.env.AR_DB_FORKS = forks;
    if (slots === undefined) delete process.env.AR_DB_SLOTS;
    else process.env.AR_DB_SLOTS = slots;
  }

  describe("workerForkCount", () => {
    it("defaults to the shared default fork count when AR_DB_FORKS is unset", () => {
      setEnv(undefined);
      expect(workerForkCount()).toBe(DEFAULT_FORKS);
    });

    it("reads AR_DB_FORKS", () => {
      setEnv("8");
      expect(workerForkCount()).toBe(8);
    });

    it("clamps to at least 1", () => {
      setEnv("0");
      expect(workerForkCount()).toBe(DEFAULT_FORKS);
      expect(workerForkCount()).toBeGreaterThanOrEqual(1);
    });

    it("treats a non-numeric value as the default fork count", () => {
      setEnv("auto");
      expect(workerForkCount()).toBe(DEFAULT_FORKS);
    });

    it("prefers TRAILS_TEST_FORKS over AR_DB_FORKS", () => {
      setEnv("8");
      process.env.TRAILS_TEST_FORKS = "3";
      expect(workerForkCount()).toBe(3);
    });

    it("reads TRAILS_TEST_FORKS when AR_DB_FORKS is unset", () => {
      setEnv(undefined);
      process.env.TRAILS_TEST_FORKS = "2";
      expect(workerForkCount()).toBe(2);
    });

    it("takes the single-worker path for TRAILS_TEST_FORKS=1", () => {
      setEnv("8");
      process.env.TRAILS_TEST_FORKS = "1";
      expect(workerForkCount()).toBe(1);
    });

    it("clamps the request to the host's core count minus one", () => {
      cores = 4;
      setEnv("8");
      expect(workerForkCount()).toBe(3);
    });

    it("clamps the default fork count on a small host", () => {
      cores = 2;
      setEnv(undefined);
      expect(workerForkCount()).toBe(1);
    });

    it("never clamps below 1, even on a single-core host", () => {
      cores = 1;
      setEnv("8");
      expect(workerForkCount()).toBe(1);
    });
  });

  describe("slotPoolSize", () => {
    it("adds headroom over the worker count", () => {
      setEnv("2");
      expect(slotPoolSize()).toBe(4);
    });

    it("keeps headroom at the CI fork count of 8", () => {
      setEnv("8");
      expect(slotPoolSize()).toBe(10);
    });

    it("has headroom even for a single worker", () => {
      setEnv("1");
      expect(slotPoolSize()).toBe(3);
    });

    it("honors an explicit AR_DB_SLOTS override", () => {
      setEnv("2", "16");
      expect(slotPoolSize()).toBe(16);
    });

    it("ignores a non-positive AR_DB_SLOTS override", () => {
      setEnv("4", "0");
      expect(slotPoolSize()).toBe(6);
    });

    it("clamps an undersized override up to workers + 1", () => {
      setEnv("8", "4");
      expect(slotPoolSize()).toBe(9);
    });

    it("tracks the clamped worker count, not the request", () => {
      cores = 4;
      setEnv("8");
      expect(slotPoolSize()).toBe(5);
    });

    it("is always strictly greater than the worker count", () => {
      for (const forks of [1, 2, 4, 8]) {
        setEnv(String(forks));
        expect(slotPoolSize()).toBeGreaterThan(workerForkCount());
        // ...even when an undersized override is supplied.
        setEnv(String(forks), "1");
        expect(slotPoolSize()).toBeGreaterThan(workerForkCount());
      }
    });
  });
});
