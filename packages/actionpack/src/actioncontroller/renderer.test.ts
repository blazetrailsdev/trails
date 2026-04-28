import { describe, it, expect } from "vitest";
import { Renderer } from "./renderer.js";

describe("Renderer", () => {
  describe("envForRequest (via .env getter)", () => {
    it("returns a copy of @env when HTTP_HOST is set, even with routes", () => {
      const controller = { _routes: { defaultEnv: { HTTP_HOST: "default.example.com" } } };
      const renderer = new Renderer(controller, { http_host: "explicit.example.com" });

      const env = renderer.env;

      expect(env.HTTP_HOST).toBe("explicit.example.com");
    });

    it("returns a copy of @env when controller has no routes", () => {
      const renderer = new Renderer({}, { method: "post" });

      const env = renderer.env;

      expect(env.REQUEST_METHOD).toBe("POST");
    });

    it("merges routes.defaultEnv beneath @env when no HTTP_HOST in @env", () => {
      const controller = {
        _routes: { defaultEnv: { HTTP_HOST: "default.example.com", SCRIPT_NAME: "/app" } },
      };
      const renderer = new Renderer(controller, { method: "get" });

      const env = renderer.env;

      expect(env).toEqual({
        HTTP_HOST: "default.example.com",
        SCRIPT_NAME: "/app",
        REQUEST_METHOD: "GET",
      });
    });

    it("@env entries override routes.defaultEnv on the same key", () => {
      const controller = {
        _routes: { defaultEnv: { SCRIPT_NAME: "/old", HTTP_HOST: "default.example.com" } },
      };
      const renderer = new Renderer(controller, { script_name: "/new" });

      const env = renderer.env;

      expect(env.SCRIPT_NAME).toBe("/new");
      expect(env.HTTP_HOST).toBe("default.example.com");
    });
  });

  describe("normalizeEnv", () => {
    it("translates :https to HTTPS on/off", () => {
      expect(Renderer.normalizeEnv({ https: true }).HTTPS).toBe("on");
      expect(Renderer.normalizeEnv({ https: false }).HTTPS).toBe("off");
    });

    it("uppercases :method into REQUEST_METHOD", () => {
      expect(Renderer.normalizeEnv({ method: "get" }).REQUEST_METHOD).toBe("GET");
      expect(Renderer.normalizeEnv({ method: "post" }).REQUEST_METHOD).toBe("POST");
    });

    it("translates known rack keys", () => {
      const env = Renderer.normalizeEnv({
        http_host: "example.com",
        script_name: "/app",
        input: "stdin",
      });
      expect(env.HTTP_HOST).toBe("example.com");
      expect(env.SCRIPT_NAME).toBe("/app");
      expect(env["rack.input"]).toBe("stdin");
    });

    it("defaults HTTPS to off and SCRIPT_NAME to '' when HTTP_HOST is set", () => {
      const env = Renderer.normalizeEnv({ http_host: "example.com" });
      expect(env.HTTPS).toBe("off");
      expect(env.SCRIPT_NAME).toBe("");
    });

    it("derives rack.url_scheme from HTTPS", () => {
      expect(
        Renderer.normalizeEnv({ http_host: "example.com", https: true })["rack.url_scheme"],
      ).toBe("https");
      expect(
        Renderer.normalizeEnv({ http_host: "example.com", https: false })["rack.url_scheme"],
      ).toBe("http");
    });
  });
});
