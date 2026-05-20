import { describe, it, expect, beforeEach } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { InfoController, matchingRoutes } from "./info-controller.js";
import { Info, PropertyList } from "./info.js";

// Mirrors railties/test/rails_info_controller_test.rb to the extent
// possible without ApplicationController / RoutesInspector ports.

const { TestCase } = ActionController;

describe("InfoControllerTest", () => {
  beforeEach(() => {
    Info.properties = new PropertyList();
    Info.property("Hello", "World");
  });

  it("info controller renders a table with properties", async () => {
    const tc = new TestCase(InfoController);
    await tc.get("properties");
    expect(tc.response.body).toContain("<table>");
    expect(tc.response.body).toContain('<td class="name">Hello</td>');
  });

  it("info controller renders with routes", async () => {
    const tc = new TestCase(InfoController);
    await tc.get("routes");
    expect(tc.response.status).toBe(200);
  });

  it("info controller search returns empty exact matches for unknown queries", async () => {
    const tc = new TestCase(InfoController);
    await tc.get("routes", { params: { query: "rails_info_properties" } });
    const body = JSON.parse(tc.response.body as string) as { exact: string[]; fuzzy: string[] };
    expect(body.exact).toEqual([]);
    expect(body.fuzzy).toEqual([]);
  });

  it("matchingRoutes returns [] for empty query", () => {
    expect(matchingRoutes("", true)).toEqual([]);
    expect(matchingRoutes("", false)).toEqual([]);
  });

  it("index redirects to /rails/info/routes", async () => {
    const tc = new TestCase(InfoController);
    await tc.get("index");
    expect(tc.response.status).toBe(302);
    expect(tc.response.getHeader("location")).toBe("/rails/info/routes");
  });
});
