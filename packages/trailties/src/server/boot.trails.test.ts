import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { _resetTrailsEnv } from "../rails.js";
import { pinEnvironment, serverEnvironment, serverHost, serverPort } from "./boot.js";

describe("server boot options (trails)", () => {
  let savedTrailsEnv: string | undefined;
  let savedNodeEnv: string | undefined;
  let savedPort: string | undefined;
  let savedBinding: string | undefined;

  beforeEach(() => {
    savedTrailsEnv = env.TRAILS_ENV;
    savedNodeEnv = env.NODE_ENV;
    savedPort = env.PORT;
    savedBinding = env.BINDING;
    for (const key of ["TRAILS_ENV", "NODE_ENV", "PORT", "BINDING"]) setEnv(key, undefined);
    _resetTrailsEnv();
  });

  afterEach(() => {
    setEnv("TRAILS_ENV", savedTrailsEnv);
    setEnv("NODE_ENV", savedNodeEnv);
    setEnv("PORT", savedPort);
    setEnv("BINDING", savedBinding);
    _resetTrailsEnv();
  });

  describe("environment", () => {
    it("is development with nothing set", () => {
      expect(serverEnvironment()).toBe("development");
    });

    it("prefers the option, then TRAILS_ENV, then NODE_ENV", () => {
      setEnv("NODE_ENV", "staging");
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

  describe("pinEnvironment", () => {
    it("pins TRAILS_ENV for the rest of the process", () => {
      expect(pinEnvironment({ environment: "production" })).toBe("production");
      expect(env.TRAILS_ENV).toBe("production");
    });

    it("does not override an already-set TRAILS_ENV, which wins over the flag", () => {
      setEnv("TRAILS_ENV", "test");

      expect(pinEnvironment({ environment: "production" })).toBe("production");
      expect(env.TRAILS_ENV).toBe("test");
    });

    it("leaves an explicitly-empty TRAILS_ENV alone", () => {
      setEnv("TRAILS_ENV", "");
      pinEnvironment({ environment: "production" });
      expect(env.TRAILS_ENV).toBe("");
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
