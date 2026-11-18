import type { RackApp, RackEnv } from "@blazetrails/rack";
import { block } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

import { Cors } from "../../lib/index.js";

const app = (() => {}) as unknown as RackApp;

describe("DSL", () => {
  it("should support explicit config object dsl mode", () => {
    const cors = new Cors(app, {}, (cfg) => {
      cfg.allow((allow) => {
        allow.origins(
          "localhost:3000",
          "127.0.0.1:3000",
          block(
            (source: string | null, env: RackEnv) =>
              source === "http://10.10.10.10:3000" && env["USER_AGENT"] === "test-agent",
          ),
        );
        allow.resource("/get-only", { methods: "get" });
        allow.resource("/", { headers: "any" });
      });
    });
    const resources = cors["allResources"]();

    expect(resources.length).toEqual(1);
    expect(resources[0].isAllowOrigin("http://localhost:3000")).toEqual(true);
    expect(
      resources[0].isAllowOrigin("http://10.10.10.10:3000", { USER_AGENT: "test-agent" }),
    ).toEqual(true);
    expect(
      resources[0].isAllowOrigin("http://10.10.10.10:3001", { USER_AGENT: "test-agent" }),
    ).not.toEqual(true);
    expect(
      resources[0].isAllowOrigin("http://10.10.10.10:3000", { USER_AGENT: "other-agent" }),
    ).not.toEqual(true);
  });

  it("should support implicit config object dsl mode", () => {
    const cors = new Cors(app, {}, function () {
      this.allow(function () {
        this.origins(
          "localhost:3000",
          "127.0.0.1:3000",
          block(
            (source: string | null, env: RackEnv) =>
              source === "http://10.10.10.10:3000" && env["USER_AGENT"] === "test-agent",
          ),
        );
        this.resource("/get-only", { methods: "get" });
        this.resource("/", { headers: "any" });
      });
    });
    const resources = cors["allResources"]();

    expect(resources.length).toEqual(1);
    expect(resources[0].isAllowOrigin("http://localhost:3000")).toEqual(true);
    expect(
      resources[0].isAllowOrigin("http://10.10.10.10:3000", { USER_AGENT: "test-agent" }),
    ).toEqual(true);
    expect(
      resources[0].isAllowOrigin("http://10.10.10.10:3001", { USER_AGENT: "test-agent" }),
    ).not.toEqual(true);
    expect(
      resources[0].isAllowOrigin("http://10.10.10.10:3000", { USER_AGENT: "other-agent" }),
    ).not.toEqual(true);
  });

  it('should support "file://" origin', () => {
    const cors = new Cors(app, {}, function () {
      this.allow(function () {
        this.origins("file://");
        this.resource("/", { headers: "any" });
      });
    });
    const resources = cors["allResources"]();

    expect(resources[0].isAllowOrigin("file://")).toEqual(true);
  });

  it("should default credentials option to false", () => {
    const cors = new Cors(app, {}, function () {
      this.allow(function () {
        this.origins("example.net");
        this.resource("/", { headers: "any" });
      });
    });
    const resources = cors["allResources"]();
    expect(resources[0].resources[0].credentials).toEqual(false);
  });
});
