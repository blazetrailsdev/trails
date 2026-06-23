import { afterEach, describe, expect, it } from "vitest";
import { slotPoolSize, workerForkCount } from "./ar-db-slots.js";

const ENV_KEYS = ["AR_DB_FORKS", "AR_DB_SLOTS"] as const;

describe("ar-db-slots", () => {
  const saved = new Map<string, string | undefined>();
  for (const k of ENV_KEYS) saved.set(k, process.env[k]);

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  function setEnv(forks?: string, slots?: string): void {
    if (forks === undefined) delete process.env.AR_DB_FORKS;
    else process.env.AR_DB_FORKS = forks;
    if (slots === undefined) delete process.env.AR_DB_SLOTS;
    else process.env.AR_DB_SLOTS = slots;
  }

  describe("workerForkCount", () => {
    it("defaults to 1 when AR_DB_FORKS is unset", () => {
      setEnv(undefined);
      expect(workerForkCount()).toBe(1);
    });

    it("reads AR_DB_FORKS", () => {
      setEnv("8");
      expect(workerForkCount()).toBe(8);
    });

    it("clamps to at least 1", () => {
      setEnv("0");
      expect(workerForkCount()).toBe(1);
    });

    it("treats a non-numeric value as single-worker", () => {
      setEnv("auto");
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
