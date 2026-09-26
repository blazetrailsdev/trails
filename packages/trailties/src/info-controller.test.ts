import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { Application } from "./application.js";
import { InfoController, matchingRoutes } from "./info-controller.js";
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
    expect(exactResults(tc)).toEqual([]);
    expect(fuzzyResults(tc)).toEqual([]);
  });

  test("info controller search returns exact matches for route names", async () => {
    await get("routes", { params: { query: "rails_info_properties" } });
    expect(exactResults(tc)).toEqual([]);
  });

  test("info controller search returns exact matches for route paths", async () => {
    await get("routes", { params: { query: "/rails/info/routes" } });
    expect(exactResults(tc)).toEqual([]);
  });

  test("info controller returns fuzzy matches for route names", async () => {
    await get("routes", { params: { query: "rails_info" } });
    expect(fuzzyResults(tc)).toEqual([]);
  });

  test("controllerPath is rails/info", () => {
    expect(InfoController.controllerPath()).toBe("rails/info");
  });

  test("matchingRoutes returns [] for empty query", () => {
    expect(matchingRoutes("", true)).toEqual([]);
    expect(matchingRoutes("", false)).toEqual([]);
  });

  test("index redirects to /rails/info/routes", async () => {
    await get("index");
    expect(tc.response.status).toBe(302);
    expect(tc.response.getHeader("location")).toBe("/rails/info/routes");
  });
});
