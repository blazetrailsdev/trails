import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { Duration, MemoryStore } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import { TestCase } from "../test-case.js";

type CacheStoreHost = { cacheStore: MemoryStore };

class RateLimitedController extends Base {
  static {
    (this as unknown as CacheStoreHost).cacheStore = new MemoryStore();
    this.rateLimit({ to: 2, within: Duration.seconds(2), only: "limited" });
    this.rateLimit({ to: 5, within: Duration.minutes(1), name: "long-term", only: "limited" });
  }

  limited(): void {
    this.head("ok");
  }

  static {
    this.rateLimit({
      to: 2,
      within: Duration.seconds(2),
      by(this: RateLimitedController) {
        return this.params.get("rate_limit_key") as string | undefined;
      },
      with(this: RateLimitedController) {
        this.head("forbidden");
      },
      only: "limitedWith",
    });
  }

  limitedWith(): void {
    this.head("ok");
  }
}

describe("RateLimitingTest", () => {
  let tc: TestCase;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(() => {
    vi.useFakeTimers();
    (RateLimitedController as unknown as CacheStoreHost).cacheStore.clear();
    tc = new TestCase(RateLimitedController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exceeding basic limit", async () => {
    await tc.get("limited");
    await tc.get("limited");
    assertResponse("ok");

    await tc.get("limited");
    assertResponse("too_many_requests");
  });

  it("multiple rate limits", async () => {
    await tc.get("limited");
    await tc.get("limited");
    assertResponse("ok");

    vi.advanceTimersByTime(3000);
    await tc.get("limited");
    await tc.get("limited");
    assertResponse("ok");

    vi.advanceTimersByTime(3000);
    await tc.get("limited");
    await tc.get("limited");
    assertResponse("too_many_requests");
  });

  it("limit resets after time", async () => {
    await tc.get("limited");
    await tc.get("limited");
    assertResponse("ok");

    vi.advanceTimersByTime(3000);
    await tc.get("limited");
    assertResponse("ok");
  });

  it("limit by", async () => {
    await tc.get("limitedWith");
    await tc.get("limitedWith");
    await tc.get("limitedWith");
    assertResponse("forbidden");

    await tc.get("limitedWith", { params: { rate_limit_key: "other" } });
    assertResponse("ok");
  });

  it("limited with", async () => {
    await tc.get("limitedWith");
    await tc.get("limitedWith");
    await tc.get("limitedWith");
    assertResponse("forbidden");
  });
});
