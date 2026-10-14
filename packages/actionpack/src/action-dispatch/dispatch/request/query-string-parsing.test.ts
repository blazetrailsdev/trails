import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Request as RackRequest, type RackApp, type RackEnv } from "@blazetrails/rack";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Request } from "../../http/request.js";
import { RequestUtils } from "../../request/utils.js";
import { Base } from "../../../action-controller/base.js";
import { deprecator } from "../../deprecator.js";
import { IntegrationTest } from "../../testing/integration.js";
import type { MiddlewareFactory } from "../../middleware/stack.js";
import type { RouteSet } from "../../routing/route-set.js";
import "../../../test-helpers/abstract-unit.js";

function assertParses(expected: unknown, query: string): void {
  const req = new Request({ QUERY_STRING: query });
  expect(req.queryParameters).toEqual(expected);
}

class QueryStringParsingTest extends IntegrationTest {}
registerConstant("QueryStringParsingTest", QueryStringParsingTest);

describe("QueryStringParsingTest", () => {
  class TestController extends Base {
    static lastQueryParameters: unknown;

    async parse(): Promise<void> {
      TestController.lastQueryParameters = this.request.queryParameters;
      await this.head(":ok");
    }
  }

  class EarlyParse {
    private app: RackApp;

    constructor(app: RackApp) {
      this.app = app;
    }

    populateRackCache(env: RackEnv): void {
      void new RackRequest(env).params;
    }

    call(env: RackEnv) {
      this.populateRackCache(env);
      return this.app(env);
    }
  }

  let t: QueryStringParsingTest;
  beforeEach(({ testCase }) => {
    t = testCase as QueryStringParsingTest;
    t.app = IntegrationTest.buildApp(null, (middleware) => {
      middleware.use(EarlyParse as unknown as MiddlewareFactory);
    });
  });
  const initialPerformDeepMunge = RequestUtils.performDeepMunge;
  afterEach(() => {
    RequestUtils.performDeepMunge = initialPerformDeepMunge;
  });

  it("query string", () => {
    assertParses(
      { action: "create_customer", full_name: "David Heinemeier Hansson", customerId: "1" },
      "action=create_customer&full_name=David%20Heinemeier%20Hansson&customerId=1",
    );
  });

  it("deep query string", () => {
    assertParses({ x: { y: { z: "10" } } }, "x[y][z]=10");
  });

  it("deep query string with array", () => {
    assertParses({ x: { y: { z: ["10"] } } }, "x[y][z][]=10");
    assertParses({ x: { y: { z: ["10", "5"] } } }, "x[y][z][]=10&x[y][z][]=5");
  });

  it("deep query string with array of hash", () => {
    assertParses({ x: { y: [{ z: "10" }] } }, "x[y][][z]=10");
    assertParses({ x: { y: [{ z: "10", w: "10" }] } }, "x[y][][z]=10&x[y][][w]=10");
    assertParses({ x: { y: [{ z: "10", v: { w: "10" } }] } }, "x[y][][z]=10&x[y][][v][w]=10");
  });

  it("deep query string with array of hashes with one pair", () => {
    assertParses({ x: { y: [{ z: "10" }, { z: "20" }] } }, "x[y][][z]=10&x[y][][z]=20");
  });

  it("deep query string with array of hashes with multiple pairs", () => {
    assertParses(
      {
        x: {
          y: [
            { z: "10", w: "a" },
            { z: "20", w: "b" },
          ],
        },
      },
      "x[y][][z]=10&x[y][][w]=a&x[y][][z]=20&x[y][][w]=b",
    );
  });

  it("query string with nil", () => {
    assertParses({ action: "create_customer", full_name: "" }, "action=create_customer&full_name=");
  });

  it("query string with array", () => {
    assertParses(
      { action: "create_customer", selected: ["1", "2", "3"] },
      "action=create_customer&selected[]=1&selected[]=2&selected[]=3",
    );
  });

  it("query string with amps", () => {
    assertParses(
      { action: "create_customer", name: "Don't & Does" },
      "action=create_customer&name=Don%27t+%26+Does",
    );
  });

  it("query string with many equal", () => {
    assertParses(
      { action: "create_customer", full_name: "abc=def=ghi" },
      "action=create_customer&full_name=abc=def=ghi",
    );
  });

  it("query string without equal", () => {
    assertParses({ action: null }, "action");
    assertParses({ action: { foo: null } }, "action[foo]");
    assertParses({ action: { foo: { bar: null } } }, "action[foo][bar]");
    assertParses({ action: { foo: { bar: [] } } }, "action[foo][bar][]");
    assertParses({ action: { foo: [] } }, "action[foo][]");
    assertParses({ action: { foo: [{ bar: null }] } }, "action[foo][][bar]");
  });

  it("array parses without nil", () => {
    assertParses({ action: ["1"] }, "action[]=1&action[]");
  });

  it("perform_deep_munge", () => {
    RequestUtils.performDeepMunge = false;
    try {
      assertParses({ action: null }, "action");
      assertParses({ action: { foo: null } }, "action[foo]");
      assertParses({ action: { foo: { bar: null } } }, "action[foo][bar]");
      assertParses({ action: { foo: { bar: [null] } } }, "action[foo][bar][]");
      assertParses({ action: { foo: [null] } }, "action[foo][]");
      assertParses({ action: { foo: [{ bar: null }] } }, "action[foo][][bar]");
      assertParses({ action: ["1", null] }, "action[]=1&action[]");
    } finally {
      RequestUtils.performDeepMunge = initialPerformDeepMunge;
    }
  });

  it("query string with empty key", () => {
    assertParses(
      { action: "create_customer", full_name: "David Heinemeier Hansson" },
      "action=create_customer&full_name=David%20Heinemeier%20Hansson&=Save",
    );
  });

  it("query string with many ampersands", () => {
    assertParses(
      { action: "create_customer", full_name: "David Heinemeier Hansson" },
      "&action=create_customer&&&full_name=David%20Heinemeier%20Hansson",
    );
  });

  it("unbalanced query string with array", () => {
    assertParses(
      { location: ["1", "2"], age_group: ["2"] },
      "location[]=1&location[]=2&age_group[]=2",
    );
  });

  it("ambiguous query string returns a bad request", async () => {
    await t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.get(":action", { to: TestController });
        });
      });

      await t.get("/parse", { headers: { QUERY_STRING: "foo[]=bar&foo[4]=bar" } });
      t.assertResponse(":bad_request");
    });
  });
});
