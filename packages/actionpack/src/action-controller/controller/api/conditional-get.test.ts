import { assertEqual, assertPredicate, Duration, isBlank } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { toI } from "@blazetrails/ruby-compat";
import { beforeEach, describe, it } from "vitest";
import { CacheConfig } from "../../../action-dispatch/http/cache.js";
import { EtagHelper } from "../../../test-helpers/support/etag-helper.js";
import "../../../test-helpers/abstract-unit.js";
import { API } from "../../api.js";
import { TestCase } from "../../test-case.js";

class ConditionalGetApiController extends API {
  static {
    this.beforeAction("handleLastModifiedAndEtags", { only: "two" });
  }

  async one() {
    if (
      this.isStale(null, { lastModified: Time.now().utc().beginningOfDay(), etag: [":foo", 123] })
    ) {
      await this.render({ plain: "Hi!" });
    }
  }

  async two() {
    await this.render({ plain: "Hi!" });
  }

  private handleLastModifiedAndEtags() {
    this.freshWhen(null, { lastModified: Time.now().utc().beginningOfDay(), etag: [":foo", 123] });
  }
}

describe("ConditionalGetApiTest", () => {
  const { weakEtag } = EtagHelper;

  class ConditionalGetApiTest extends TestCase {
    static {
      this.tests(ConditionalGetApiController);
    }

    lastModified!: string;

    override setup(): void {
      super.setup();
      this.lastModified = Time.now().utc().beginningOfDay().httpdate();
    }
  }

  let tc: ConditionalGetApiTest;
  const assertResponse = (type: number | string): void => tc.assertResponse(type);

  beforeEach(async ({ task }) => {
    tc = new ConditionalGetApiTest(task.name);
    await tc.beforeSetup();
    tc.setup();
  });

  async function withStrictFreshness(value: boolean, block: () => Promise<void>): Promise<void> {
    const oldValue = CacheConfig.strictFreshness;
    CacheConfig.strictFreshness = value;
    try {
      await block();
    } finally {
      CacheConfig.strictFreshness = oldValue;
    }
  }

  it("request gets last modified", async () => {
    await tc.get("two");
    assertEqual(tc.lastModified, tc.response.headers.get("Last-Modified"));
    assertResponse("success");
  });

  it("request obeys last modified", async () => {
    tc.request.setIfModifiedSince(tc.lastModified);
    await tc.get("two");
    assertResponse("not_modified");
  });

  it("last modified works with less than too", async () => {
    tc.request.setIfModifiedSince((Duration.years(5).ago() as Time).httpdate());
    await tc.get("two");
    assertResponse("success");
  });

  it("request not modified", async () => {
    tc.request.setIfModifiedSince(tc.lastModified);
    await tc.get("one");
    assertEqual(304, toI(tc.response.status));
    assertPredicate(tc.response.body, isBlank);
    assertEqual(tc.lastModified, tc.response.headers.get("Last-Modified"));
  });

  it("if none match is asterisk", async () => {
    tc.request.setIfNoneMatch("*");
    await tc.get("one");
    assertResponse("not_modified");
  });

  it("etag matches", async () => {
    tc.request.setIfNoneMatch(weakEtag([":foo", 123]));
    await tc.get("one");
    assertResponse("not_modified");
  });

  it("strict freshness with etag", async () => {
    await withStrictFreshness(true, async () => {
      tc.request.setIfNoneMatch(weakEtag([":foo", 123]));

      await tc.get("one");
      assertResponse("not_modified");
    });
  });

  it("strict freshness with last modified", async () => {
    await withStrictFreshness(true, async () => {
      tc.request.setIfModifiedSince(tc.lastModified);

      await tc.get("one");
      assertResponse("not_modified");
    });
  });

  it("strict freshness etag precedence over last modified", async () => {
    await withStrictFreshness(true, async () => {
      tc.request.setIfModifiedSince((Duration.years(5).ago() as Time).httpdate());
      tc.request.setIfNoneMatch(weakEtag([":foo", 123]));

      await tc.get("one");
      assertResponse("not_modified");

      tc.request.setIfNoneMatch(weakEtag([":bar", 124]));
      tc.request.setIfModifiedSince(tc.lastModified);

      await tc.get("one");
      assertResponse("success");
    });
  });

  it("both should be used when strict freshness is false", async () => {
    await withStrictFreshness(false, async () => {
      tc.request.setIfModifiedSince((Duration.years(5).ago() as Time).httpdate());
      tc.request.setIfNoneMatch(weakEtag([":foo", 123]));

      await tc.get("one");
      assertResponse("ok");
    });
  });
});
