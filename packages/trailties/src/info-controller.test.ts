import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ActionController, type RouteSet } from "@blazetrails/actionpack";
import { assert, include } from "@blazetrails/activesupport";
import { Application } from "./application.js";
import { InfoController } from "./info-controller.js";
import { Info, PropertyList } from "./info.js";
import { Trails } from "./rails.js";

const { TestCase } = ActionController;

function exactResults(tc: InstanceType<typeof TestCase>): string[] {
  return (JSON.parse(tc.response.body) as { exact: string[] }).exact;
}
function fuzzyResults(tc: InstanceType<typeof TestCase>): string[] {
  return (JSON.parse(tc.response.body) as { fuzzy: string[] }).fuzzy;
}

class InfoControllerTestApp extends Application {}

describe("InfoControllerTest", () => {
  let tc: InstanceType<typeof TestCase>;
  let remoteAddr: string;
  const get = (action: string, options: { params?: Record<string, unknown> } = {}) =>
    tc.get(action, { ...options, env: { REMOTE_ADDR: remoteAddr } });

  beforeEach(() => {
    Trails.application = InfoControllerTestApp.instance();
    const routes = Trails.application.routes() as unknown as RouteSet;
    routes.clearBang();
    routes.draw((r) => {
      r.namespace("test", (r) => {
        r.get("nested_route", { to: "test#show" });
      });
      r.get("/rails/info/properties", { to: "rails/info#properties" });
      r.get("/rails/info/routes", { to: "rails/info#routes" });
      r.get("/rails/info/notes", { to: "rails/info#notes" });
      r.post("/rails/:test/properties", { to: "rails/info#properties" });
      r.put("/rails/:test/named_properties", {
        to: "rails/info#properties",
        as: "named_rails_info_properties",
      });
    });

    include(InfoController, routes.urlHelpers());

    tc = new TestCase(InfoController);
    remoteAddr = "127.0.0.1";
    Info.properties = new PropertyList();
    Info.property("Hello", "World");
  });

  afterEach(() => {
    Trails.application = null;
  });

  test("info controller does not allow remote requests", async () => {
    remoteAddr = "example.org";
    await get("properties");
    expect(tc.response.status).toBe(403);
  });

  test("info controller renders an error message when request was forbidden", async () => {
    remoteAddr = "example.org";
    await get("properties");
    expect(tc.response.body).toContain("<p>");
  });

  test("info controller allows requests when all requests are considered local", async () => {
    remoteAddr = "example.org";
    Trails.application!.config.considerAllRequestsLocal = true;
    try {
      await get("properties");
      expect(tc.response.status).toBe(200);
    } finally {
      Trails.application!.config.considerAllRequestsLocal = false;
    }
  });

  test("info controller allows local requests", async () => {
    await get("properties");
    expect(tc.response.status).toBe(200);
  });

  test("info controller renders a table with properties", async () => {
    await get("properties");
    expect(tc.response.body).toContain("<table>");
    expect(tc.response.body).toContain('<td class="name">Hello</td>');
  });

  test("info controller renders with routes", async () => {
    await get("routes");
    expect(tc.response.status).toBe(200);
  });

  test("info controller search returns exact matches for route names", async () => {
    await get("routes", { params: { query: "rails_info_" } });
    assert(exactResults(tc).length === 0, "should not match incomplete route names");

    await get("routes", { params: { query: "" } });
    assert(exactResults(tc).length === 0, "should not match unnamed routes");

    await get("routes", { params: { query: "rails_info_properties" } });
    assert(exactResults(tc).length === 1, "should match complete route names");
    assert(exactResults(tc).includes("/rails/info/properties(.:format)"));

    await get("routes", { params: { query: "rails_info_properties_path" } });
    assert(exactResults(tc).length === 1, "should match complete route paths");
    assert(exactResults(tc).includes("/rails/info/properties(.:format)"));

    await get("routes", { params: { query: "rails_info_properties_url" } });
    assert(exactResults(tc).length === 1, "should match complete route urls");
    assert(exactResults(tc).includes("/rails/info/properties(.:format)"));
  });

  test("info controller search returns exact matches for route paths", async () => {
    await get("routes", { params: { query: "rails/info/route" } });
    assert(exactResults(tc).length === 0, "should not match incomplete route paths");

    await get("routes", { params: { query: "/rails/info/routes" } });
    assert(exactResults(tc).length === 1, "should match complete route paths prefixed with /");
    assert(exactResults(tc).includes("/rails/info/routes(.:format)"));

    await get("routes", { params: { query: "rails/info/routes" } });
    assert(exactResults(tc).length === 1, "should match complete route paths NOT prefixed with /");
    assert(exactResults(tc).includes("/rails/info/routes(.:format)"));

    await get("routes", { params: { query: "rails/info/routes.html" } });
    assert(exactResults(tc).length === 1, "should match complete route paths with optional parts");
    assert(exactResults(tc).includes("/rails/info/routes(.:format)"));

    await get("routes", { params: { query: "test/nested_route" } });
    assert(
      exactResults(tc).length === 1,
      "should match complete route paths that are nested in a namespace",
    );
    assert(exactResults(tc).includes("/test/nested_route(.:format)"));
  });

  test("info controller search returns case-sensitive exact matches for HTTP Verb methods", async () => {
    await get("routes", { params: { query: "GE" } });
    assert(exactResults(tc).length === 0, "should not match incomplete HTTP Verb methods");

    await get("routes", { params: { query: "get" } });
    assert(exactResults(tc).length === 0, "should not case-insensitive match HTTP Verb methods");

    await get("routes", { params: { query: "GET" } });
    assert(exactResults(tc).length === 4, "should match complete HTTP Verb methods");
    assert(exactResults(tc).includes("/test/nested_route(.:format)"));
    assert(exactResults(tc).includes("/rails/info/properties(.:format)"));
    assert(exactResults(tc).includes("/rails/info/routes(.:format)"));
    assert(exactResults(tc).includes("/rails/info/notes(.:format)"));
  });

  test("info controller search returns exact matches for route Controller#Action(s)", async () => {
    await get("routes", { params: { query: "rails/info#propertie" } });
    assert(exactResults(tc).length === 0, "should not match incomplete route Controller#Action(s)");

    await get("routes", { params: { query: "rails/info#properties" } });
    assert(exactResults(tc).length === 3, "should match complete route Controller#Action(s)");
    assert(exactResults(tc).includes("/rails/info/properties(.:format)"));
    assert(exactResults(tc).includes("/rails/:test/properties(.:format)"));
    assert(exactResults(tc).includes("/rails/:test/named_properties(.:format)"));
  });

  test("info controller returns fuzzy matches for route names", async () => {
    await get("routes", { params: { query: "" } });
    assert(exactResults(tc).length === 0, "should not match unnamed routes");

    await get("routes", { params: { query: "rails_info" } });
    assert(fuzzyResults(tc).length === 4, "should match incomplete route names");
    assert(fuzzyResults(tc).includes("/rails/info/properties(.:format)"));
    assert(fuzzyResults(tc).includes("/rails/info/routes(.:format)"));
    assert(fuzzyResults(tc).includes("/rails/info/notes(.:format)"));
    assert(fuzzyResults(tc).includes("/rails/:test/named_properties(.:format)"));

    await get("routes", { params: { query: "/rails/info/routes" } });
    assert(fuzzyResults(tc).length === 1, "should match complete route names");
    assert(fuzzyResults(tc).includes("/rails/info/routes(.:format)"));

    await get("routes", { params: { query: "named_rails_info_properties_path" } });
    assert(fuzzyResults(tc).length === 1, "should match complete route paths");
    assert(fuzzyResults(tc).includes("/rails/:test/named_properties(.:format)"));

    await get("routes", { params: { query: "named_rails_info_properties_url" } });
    assert(fuzzyResults(tc).length === 1, "should match complete route urls");
    assert(fuzzyResults(tc).includes("/rails/:test/named_properties(.:format)"));
  });

  test("info controller returns fuzzy matches for route paths", async () => {
    await get("routes", { params: { query: "rails/:test" } });
    assert(fuzzyResults(tc).length === 2, "should match incomplete routes");
    assert(fuzzyResults(tc).includes("/rails/:test/properties(.:format)"));
    assert(fuzzyResults(tc).includes("/rails/:test/named_properties(.:format)"));

    await get("routes", { params: { query: "/rails/info/routes" } });
    assert(fuzzyResults(tc).length === 1, "should match complete routes");
    assert(fuzzyResults(tc).includes("/rails/info/routes(.:format)"));

    await get("routes", { params: { query: "rails/info/routes.html" } });
    assert(fuzzyResults(tc).length === 0, "should match optional parts of route literally");
  });

  test("info controller search returns fuzzy matches for route Controller#Action(s)", async () => {
    await get("routes", { params: { query: "rails/info#propertie" } });
    assert(fuzzyResults(tc).length === 3, "should match incomplete routes");
    assert(fuzzyResults(tc).includes("/rails/info/properties(.:format)"));
    assert(fuzzyResults(tc).includes("/rails/:test/properties(.:format)"));
    assert(fuzzyResults(tc).includes("/rails/:test/named_properties(.:format)"));

    await get("routes", { params: { query: "rails/info#properties" } });
    assert(fuzzyResults(tc).length === 3, "should match complete route Controller#Action(s)");
    assert(fuzzyResults(tc).includes("/rails/info/properties(.:format)"));
    assert(fuzzyResults(tc).includes("/rails/:test/properties(.:format)"));
    assert(fuzzyResults(tc).includes("/rails/:test/named_properties(.:format)"));
  });

  test("index redirects to /rails/info/routes", async () => {
    await get("index");
    expect(tc.response.status).toBe(302);
    expect(tc.response.getHeader("location")).toBe("/rails/info/routes");
  });
});
