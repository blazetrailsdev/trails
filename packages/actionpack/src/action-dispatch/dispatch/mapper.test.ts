import { describe, it, expect } from "vitest";
import { bodyFromString } from "@blazetrails/rack";
import { Mapper } from "../routing/mapper.js";
import { RouteSet } from "../routing/route-set.js";

// ==========================================================================
// dispatch/mapper_test.rb
// ==========================================================================
describe("MapperTest", () => {
  it("initialize", () => {
    const routes = new RouteSet();
    routes.draw((r) => {
      r.get("/foo", { to: "foo#index" });
    });
    expect(routes.getRoutes().length).toBeGreaterThan(0);
  });

  const app = (_env: Record<string, unknown>) => [200, {}, bodyFromString("")] as const;

  it("can pass anchor to mount", () => {
    const m = new Mapper();
    m.mount(app, { at: "/path", anchor: true });
    expect(m.routes[0].path).toBe("/path");
    expect(m.routes[0].anchor).toBe(true);
  });

  it("raising error when path is not passed", () => {
    const m = new Mapper();
    expect(() => m.mount(app)).toThrow(/mount point/);
  });

  it("raising error when rack app is not passed", () => {
    const m = new Mapper();
    expect(() =>
      m.mount(10 as unknown as Parameters<Mapper["mount"]>[0], { as: "exciting" }),
    ).toThrow(/rack application must be specified/);
    expect(() =>
      m.mount(undefined as unknown as Parameters<Mapper["mount"]>[0], { as: "exciting" }),
    ).toThrow(/rack application must be specified/);
  });
});

describe("Mapper#mount dispatch", () => {
  it("forwards a matched request to the mounted app with SCRIPT_NAME/PATH_INFO rewritten", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const engine = (env: Record<string, unknown>) => {
      seen.push({ SCRIPT_NAME: env["SCRIPT_NAME"], PATH_INFO: env["PATH_INFO"] });
      return [200, { "content-type": "text/plain" }, bodyFromString("engine-ok")];
    };
    const routes = new RouteSet();
    routes.draw((r) => r.mount(engine, { at: "/foo" }));

    const res = await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/foo/bar" });
    expect(res[0]).toBe(200);
    expect(seen).toEqual([{ SCRIPT_NAME: "/foo", PATH_INFO: "/bar" }]);
  });

  it("dynamic mount points get SCRIPT_NAME from Journey's matched prefix", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const engine = (env: Record<string, unknown>) => {
      seen.push({
        SCRIPT_NAME: env["SCRIPT_NAME"],
        PATH_INFO: env["PATH_INFO"],
        path_parameters: env["action_dispatch.request.path_parameters"],
      });
      return [200, {}, bodyFromString("")];
    };
    const routes = new RouteSet();
    routes.draw((r) => r.mount(engine, { at: "/:tenant" }));

    await routes.call({ REQUEST_METHOD: "GET", PATH_INFO: "/acme/widgets" });
    expect(seen).toEqual([
      { SCRIPT_NAME: "/acme", PATH_INFO: "/widgets", path_parameters: { tenant: "acme" } },
    ]);
  });
});
