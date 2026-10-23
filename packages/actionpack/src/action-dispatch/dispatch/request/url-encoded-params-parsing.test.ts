import { describe, it, afterEach, beforeEach } from "vitest";
import { registerConstant } from "@blazetrails/ruby-compat";
import { assertEqual } from "@blazetrails/activesupport";
import { Base } from "../../../action-controller/base.js";
import { deprecator } from "../../deprecator.js";
import { IntegrationTest } from "../../testing/integration.js";
import type { RouteSet } from "../../routing/route-set.js";
import type { MountableApp } from "../../routing/mapper.js";
import "../../../test-helpers/abstract-unit.js";

class UrlEncodedParamsParsingTest extends IntegrationTest {}
registerConstant("UrlEncodedParamsParsingTest", UrlEncodedParamsParsingTest);

describe("UrlEncodedParamsParsingTest", () => {
  class TestController extends Base {
    static lastRequestParameters: Record<string, unknown> | null = null;
    static lastRequestType: unknown = null;

    async parse(): Promise<void> {
      TestController.lastRequestParameters = this.request.requestParameters;
      await this.head(":ok");
    }
  }

  let t: UrlEncodedParamsParsingTest;
  beforeEach(({ testCase }) => {
    t = testCase as UrlEncodedParamsParsingTest;
  });

  afterEach(() => {
    TestController.lastRequestParameters = null;
  });

  it("parses unbalanced query string with array", async () => {
    const query = "location[]=1&location[]=2&age_group[]=2";
    const expected = { location: ["1", "2"], age_group: ["2"] };
    await assertParses(expected, query);
  });

  it("parses nested hash", async () => {
    const query = [
      "note[viewers][viewer][][type]=User",
      "note[viewers][viewer][][id]=1",
      "note[viewers][viewer][][type]=Group",
      "note[viewers][viewer][][id]=2",
    ].join("&");
    const expected = {
      note: {
        viewers: {
          viewer: [
            { id: "1", type: "User" },
            { type: "Group", id: "2" },
          ],
        },
      },
    };
    await assertParses(expected, query);
  });

  it("parses more complex nesting", async () => {
    const query = [
      "customers[boston][first][name]=David",
      "customers[boston][first][url]=http://David",
      "customers[boston][second][name]=Allan",
      "customers[boston][second][url]=http://Allan",
      "something_else=blah",
      "something_nil=",
      "something_empty=",
      "products[first]=Apple Computer",
      "products[second]=Pc",
      "=Save",
    ].join("&");
    const expected = {
      customers: {
        boston: {
          first: {
            name: "David",
            url: "http://David",
          },
          second: {
            name: "Allan",
            url: "http://Allan",
          },
        },
      },
      something_else: "blah",
      something_empty: "",
      something_nil: "",
      products: {
        first: "Apple Computer",
        second: "Pc",
      },
    };
    await assertParses(expected, query);
  });

  it("parses params with array", async () => {
    const query = "selected[]=1&selected[]=2&selected[]=3";
    const expected = { selected: ["1", "2", "3"] };
    await assertParses(expected, query);
  });

  it("parses params with nil key", async () => {
    const query = "=&test2=value1";
    const expected = { test2: "value1" };
    await assertParses(expected, query);
  });

  it("parses params with array prefix and hashes", async () => {
    const query = "a[][b][c]=d";
    const expected = { a: [{ b: { c: "d" } }] };
    await assertParses(expected, query);
  });

  it("parses params with complex nesting", async () => {
    const query = "a[][b][c][][d][]=e";
    const expected = { a: [{ b: { c: [{ d: ["e"] }] } }] };
    await assertParses(expected, query);
  });

  it("parses params with file path", async () => {
    const query = [
      "customers[boston][first][name]=David",
      "something_else=blah",
      `logo=${import.meta.filename}`,
    ].join("&");
    const expected = {
      customers: {
        boston: {
          first: {
            name: "David",
          },
        },
      },
      something_else: "blah",
      logo: import.meta.filename,
    };
    await assertParses(expected, query);
  });

  it("parses params with Safari 2 trailing null character", async () => {
    const query = "selected[]=1&selected[]=2&selected[]=3\0";
    const expected = { selected: ["1", "2", "3"] };
    await assertParses(expected, query);
  });

  it("ambiguous params returns a bad request", async () => {
    await withTestRouting(async () => {
      await t.post("/parse", { params: "foo[]=bar&foo[4]=bar" });
      t.assertResponse(":bad_request");
    });
  });

  async function withTestRouting<T>(block: () => Promise<T>): Promise<T> {
    return t.withRouting(async (set: RouteSet) => {
      set.draw(function () {
        deprecator().silence(() => {
          this.post("/:action", { to: TestController as unknown as MountableApp });
        });
      });
      return block();
    });
  }

  async function assertParses(expected: Record<string, unknown>, actual: string): Promise<void> {
    await withTestRouting(async () => {
      await t.post("/parse", { params: actual });
      t.assertResponse(":ok");
      assertEqual(expected, TestController.lastRequestParameters);
    });
  }
});
