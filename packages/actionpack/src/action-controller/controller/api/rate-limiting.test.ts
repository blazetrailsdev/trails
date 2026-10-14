import { Duration, MemoryStore, travelTo } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, it } from "vitest";
import "../../../test-helpers/abstract-unit.js";
import { API } from "../../api.js";
import { TestCase } from "../../test-case.js";

type CacheStoreHost = { cacheStore: MemoryStore };

class ApiRateLimitedController extends API {
  static {
    (this as unknown as CacheStoreHost).cacheStore = new MemoryStore();
    this.rateLimit({ to: 2, within: Duration.seconds(2), only: "limitedToTwo" });
  }

  limitedToTwo() {
    this.head("ok");
  }
}

describe("ApiRateLimitingTest", () => {
  class ApiRateLimitingTest extends TestCase {
    static {
      this.tests(ApiRateLimitedController);
    }
  }

  let tc: ApiRateLimitingTest;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new ApiRateLimitingTest(task.name);
    await tc.beforeSetup();
    tc.setup();
    (ApiRateLimitedController as unknown as CacheStoreHost).cacheStore.clear();
  });

  it("exceeding basic limit", async () => {
    await tc.get("limitedToTwo");
    await tc.get("limitedToTwo");
    assertResponse("ok");

    await tc.get("limitedToTwo");
    assertResponse("too_many_requests");
  });

  it("limit resets after time", async () => {
    await tc.get("limitedToTwo");
    await tc.get("limitedToTwo");
    assertResponse("ok");

    await travelTo(Time.now().plus(3), {}, async () => {
      await tc.get("limitedToTwo");
      assertResponse("ok");
    });
  });
});
