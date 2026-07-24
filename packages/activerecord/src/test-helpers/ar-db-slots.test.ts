import { getOs } from "@blazetrails/activesupport";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_FORKS, slotPoolSize, workerForkCount } from "./ar-db-slots.js";

// The clamp workerForkCount() applies, recomputed here from the same adapter
// so expectations hold on any host (CI runners have far fewer cores than a
// dev box, and the requests below deliberately exceed small hosts).
const HOST_CAP = Math.max(getOs().availableParallelism() - 1, 1);
const capped = (n: number): number => Math.min(n, HOST_CAP);

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
    it("defaults to the shared default fork count when AR_DB_FORKS is unset", () => {
      setEnv(undefined);
      expect(workerForkCount()).toBe(capped(DEFAULT_FORKS));
    });

    it("reads AR_DB_FORKS", () => {
      setEnv("8");
      expect(workerForkCount()).toBe(capped(8));
    });

    it("clamps to at least 1", () => {
      setEnv("0");
      expect(workerForkCount()).toBe(capped(DEFAULT_FORKS));
      expect(workerForkCount()).toBeGreaterThanOrEqual(1);
    });

    it("treats a non-numeric value as the default fork count", () => {
      setEnv("auto");
      expect(workerForkCount()).toBe(capped(DEFAULT_FORKS));
    });

    it("sees the host-clamped count vitest.config.ts republishes", () => {
      // No republish any more: the clamp is applied here, against the OS
      // adapter, so an oversized request never escapes as a worker count.
      setEnv("1024");
      expect(workerForkCount()).toBe(HOST_CAP);
      expect(workerForkCount()).toBeGreaterThan(0);
    });
  });

  describe("slotPoolSize", () => {
    it("adds headroom over the worker count", () => {
      setEnv("2");
      expect(slotPoolSize()).toBe(capped(2) + 2);
    });

    it("keeps headroom at the CI fork count of 8", () => {
      setEnv("8");
      expect(slotPoolSize()).toBe(capped(8) + 2);
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
      expect(slotPoolSize()).toBe(capped(4) + 2);
    });

    it("clamps an undersized override up to workers + 1", () => {
      setEnv("8", "4");
      expect(slotPoolSize()).toBe(Math.max(4, capped(8) + 1));
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
