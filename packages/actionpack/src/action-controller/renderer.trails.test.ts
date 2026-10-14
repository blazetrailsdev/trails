import { describe, it, expect } from "vitest";
import { Renderer } from "./renderer.js";

describe("Renderer", () => {
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
        httpHost: "example.com",
        scriptName: "/app",
        input: "stdin",
      });
      expect(env.HTTP_HOST).toBe("example.com");
      expect(env.SCRIPT_NAME).toBe("/app");
      expect(env["rack.input"]).toBe("stdin");
    });

    it("defaults HTTPS to off and SCRIPT_NAME to '' when HTTP_HOST is set", () => {
      const env = Renderer.normalizeEnv({ httpHost: "example.com" });
      expect(env.HTTPS).toBe("off");
      expect(env.SCRIPT_NAME).toBe("");
    });

    it("derives rack.url_scheme from HTTPS", () => {
      expect(
        Renderer.normalizeEnv({ httpHost: "example.com", https: true })["rack.url_scheme"],
      ).toBe("https");
      expect(
        Renderer.normalizeEnv({ httpHost: "example.com", https: false })["rack.url_scheme"],
      ).toBe("http");
    });

    it("keeps a key naming an Object.prototype member or __proto__ literally", () => {
      const env = Renderer.normalizeEnv(JSON.parse('{"toString":"a","__proto__":"b"}'));
      expect(Object.entries(env)).toEqual([
        ["toString", "a"],
        ["__proto__", "b"],
      ]);
      expect(Object.getPrototypeOf(env)).toBe(Object.prototype);
    });
  });
});
