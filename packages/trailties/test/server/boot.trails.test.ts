import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env, setEnv } from "@blazetrails/ruby-compat/process-adapter";
import { _resetTrailsEnv } from "../../lib/trails.js";
import { serverEnvironment, serverHost, serverPort } from "../../lib/server/boot.js";

describe("server boot options (trails)", () => {
  let savedTrailsEnv: string | undefined;
  let savedRackEnv: string | undefined;
  let savedPort: string | undefined;
  let savedBinding: string | undefined;

  beforeEach(() => {
    savedTrailsEnv = env.TRAILS_ENV;
    savedRackEnv = env.RACK_ENV;
    savedPort = env.PORT;
    savedBinding = env.BINDING;
    for (const key of ["TRAILS_ENV", "RACK_ENV", "PORT", "BINDING"]) setEnv(key, undefined);
    _resetTrailsEnv();
  });

  afterEach(() => {
    setEnv("TRAILS_ENV", savedTrailsEnv);
    setEnv("RACK_ENV", savedRackEnv);
    setEnv("PORT", savedPort);
    setEnv("BINDING", savedBinding);
    _resetTrailsEnv();
  });

  describe("environment", () => {
    it("is development with nothing set", () => {
      expect(serverEnvironment()).toBe("development");
    });

    it("prefers the option, then TRAILS_ENV, then RACK_ENV", () => {
      setEnv("RACK_ENV", "staging");
      expect(serverEnvironment()).toBe("staging");
      setEnv("TRAILS_ENV", "test");
      expect(serverEnvironment()).toBe("test");
      expect(serverEnvironment({ environment: "production" })).toBe("production");
    });

    it("ignores an empty TRAILS_ENV rather than running in one named nothing", () => {
      setEnv("TRAILS_ENV", "");
      expect(serverEnvironment()).toBe("development");
    });
  });

  describe("host", () => {
    it("is localhost in development and 0.0.0.0 elsewhere", () => {
      expect(serverHost()).toBe("localhost");
      expect(serverHost({ environment: "production" })).toBe("0.0.0.0");
    });

    it("prefers the binding option over BINDING", () => {
      setEnv("BINDING", "127.0.0.1");
      expect(serverHost()).toBe("127.0.0.1");
      expect(serverHost({ binding: "::1" })).toBe("::1");
    });
  });

  describe("agrees with `trails server`'s defaults", () => {
    it("binds the same host for the same environment", () => {
      expect(serverHost({ environment: "development" })).toBe("localhost");
      expect(serverHost({ environment: "production" })).toBe("0.0.0.0");
      expect(serverHost({ environment: "test" })).toBe("0.0.0.0");
    });

    it("takes a string port option and the same 3000 default", () => {
      expect(serverPort({ port: "3000" })).toBe(3000);
      expect(serverPort()).toBe(3000);
    });
  });

  describe("port", () => {
    it("is 3000 with nothing set", () => {
      expect(serverPort()).toBe(3000);
    });

    it("takes PORT, which the container platforms set", () => {
      setEnv("PORT", "8080");
      expect(serverPort()).toBe(8080);
    });

    it("prefers the option, as a number or a string", () => {
      setEnv("PORT", "8080");
      expect(serverPort({ port: 3001 })).toBe(3001);
      expect(serverPort({ port: "3002" })).toBe(3002);
    });
  });
});
