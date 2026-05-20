import { beforeEach, describe, expect, test } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { InfoController, matchingRoutes } from "./info-controller.js";
import { Info, PropertyList } from "./info.js";

// Mirrors railties/test/rails_info_controller_test.rb. Test names match
// Rails verbatim for the subset of behavior we can exercise without
// `ApplicationController` / `RoutesInspector` (those tests are deferred
// follow-ups — see the PR body).

const { TestCase } = ActionController;

function exactResults(tc: InstanceType<typeof TestCase>): string[] {
  return (JSON.parse(tc.response.body as string) as { exact: string[] }).exact;
}
function fuzzyResults(tc: InstanceType<typeof TestCase>): string[] {
  return (JSON.parse(tc.response.body as string) as { fuzzy: string[] }).fuzzy;
}

describe("InfoControllerTest", () => {
  beforeEach(() => {
    Info.properties = new PropertyList();
    Info.property("Hello", "World");
  });

  test("info controller renders a table with properties", async () => {
    const tc = new TestCase(InfoController);
    await tc.get("properties");
    expect(tc.response.body).toContain("<table>");
    expect(tc.response.body).toContain('<td class="name">Hello</td>');
  });

  test("info controller renders with routes", async () => {
    const tc = new TestCase(InfoController);
    await tc.get("routes");
    expect(tc.response.status).toBe(200);
    expect(exactResults(tc)).toEqual([]);
    expect(fuzzyResults(tc)).toEqual([]);
  });

  // Until RoutesInspector lands, the route table is empty — these mirror
  // the "should not match" branch of the Rails tests of the same name.
  test("info controller search returns exact matches for route names", async () => {
    const tc = new TestCase(InfoController);
    await tc.get("routes", { params: { query: "rails_info_properties" } });
    expect(exactResults(tc)).toEqual([]);
  });

  test("info controller search returns exact matches for route paths", async () => {
    const tc = new TestCase(InfoController);
    await tc.get("routes", { params: { query: "/rails/info/routes" } });
    expect(exactResults(tc)).toEqual([]);
  });

  test("info controller returns fuzzy matches for route names", async () => {
    const tc = new TestCase(InfoController);
    await tc.get("routes", { params: { query: "rails_info" } });
    expect(fuzzyResults(tc)).toEqual([]);
  });

  test("matchingRoutes returns [] for empty query", () => {
    expect(matchingRoutes("", true)).toEqual([]);
    expect(matchingRoutes("", false)).toEqual([]);
  });

  test("index redirects to /rails/info/routes", async () => {
    const tc = new TestCase(InfoController);
    await tc.get("index");
    expect(tc.response.status).toBe(302);
    expect(tc.response.getHeader("location")).toBe("/rails/info/routes");
  });
});
