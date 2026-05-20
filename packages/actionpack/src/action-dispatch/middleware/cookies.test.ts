import { describe, expect, it } from "vitest";
import { bodyFromString, type RackEnv, type RackResponse } from "@blazetrails/rack";
import {
  CookieJar,
  Cookies,
  COOKIES_KEY,
  CookieOverflow,
  checkForOverflowBang,
} from "./cookies.js";

function emptyResponse(): RackResponse {
  return [200, {}, bodyFromString("")];
}

describe("Cookies middleware", () => {
  it("leaves headers untouched when downstream never builds a jar", async () => {
    const cookies = new Cookies(async () => [200, { "x-foo": "bar" }, bodyFromString("ok")]);
    const env: RackEnv = {};
    const [status, headers] = await cookies.call(env);
    expect(status).toBe(200);
    expect(headers["set-cookie"]).toBeUndefined();
    expect(headers["x-foo"]).toBe("bar");
  });

  it("flushes set/delete operations into a newline-joined set-cookie header", async () => {
    const cookies = new Cookies(async (env) => {
      const jar = new CookieJar();
      jar.set("session", "abc");
      jar.delete("stale");
      env[COOKIES_KEY] = jar;
      return emptyResponse();
    });
    const env: RackEnv = {};
    const [, headers] = await cookies.call(env);
    const setCookie = headers["set-cookie"];
    expect(typeof setCookie).toBe("string");
    expect(setCookie).toContain("session=abc");
    expect(setCookie).toContain("stale=");
    expect(setCookie!.split("\n")).toHaveLength(2);
  });

  it("does not double-flush a jar that was already committed", async () => {
    const cookies = new Cookies(async (env) => {
      const jar = new CookieJar();
      jar.set("a", "1");
      jar.commitBang();
      env[COOKIES_KEY] = jar;
      return emptyResponse();
    });
    const env: RackEnv = {};
    const [, headers] = await cookies.call(env);
    expect(headers["set-cookie"]).toBeUndefined();
  });

  it("merges with an existing string set-cookie from the downstream app", async () => {
    const cookies = new Cookies(async (env) => {
      const jar = new CookieJar();
      jar.set("b", "2");
      env[COOKIES_KEY] = jar;
      return [200, { "set-cookie": "a=1; path=/" }, bodyFromString("")];
    });
    const [, headers] = await cookies.call({});
    const lines = headers["set-cookie"]!.split("\n");
    expect(lines[0]).toBe("a=1; path=/");
    expect(lines[1]).toContain("b=2");
  });

  it("merges with an existing array set-cookie without comma-stringifying", async () => {
    const cookies = new Cookies(async (env) => {
      const jar = new CookieJar();
      jar.set("c", "3");
      env[COOKIES_KEY] = jar;
      // Rack::Response carries set-cookie as string[] when stacking
      // multiple cookies. The RackResponse tuple narrows to string at
      // the type level, but real downstream apps still emit arrays.
      return [
        200,
        { "set-cookie": ["a=1; path=/", "b=2; path=/"] as unknown as string },
        bodyFromString(""),
      ];
    });
    const [, headers] = await cookies.call({});
    const setCookie = headers["set-cookie"]!;
    expect(setCookie).not.toContain(",");
    expect(setCookie.split("\n")).toEqual([
      "a=1; path=/",
      "b=2; path=/",
      expect.stringContaining("c=3"),
    ]);
  });

  it("merges with an existing Set-Cookie that uses non-lowercase casing", async () => {
    const cookies = new Cookies(async (env) => {
      const jar = new CookieJar();
      jar.set("b", "2");
      env[COOKIES_KEY] = jar;
      return [200, { "Set-Cookie": "a=1; path=/" }, bodyFromString("")];
    });
    const [, headers] = await cookies.call({});
    // The non-lowercase key is dropped; the merged canonical lowercase
    // header carries both cookies.
    expect(headers["Set-Cookie"]).toBeUndefined();
    const lines = headers["set-cookie"]!.split("\n");
    expect(lines[0]).toBe("a=1; path=/");
    expect(lines[1]).toContain("b=2");
  });

  it("commits the jar so further writes are dropped after the middleware runs", async () => {
    const jar = new CookieJar();
    const cookies = new Cookies(async (env) => {
      jar.set("a", "1");
      env[COOKIES_KEY] = jar;
      return emptyResponse();
    });
    await cookies.call({});
    expect(jar.isCommitted()).toBe(true);
    jar.set("b", "2");
    jar.delete("a");
    expect(jar.get("a")).toBe("1");
    expect(jar.get("b")).toBeUndefined();
  });
});

describe("checkForOverflowBang", () => {
  it("raises CookieOverflow once a value exceeds 4096 bytes", () => {
    const big = "x".repeat(4097);
    expect(() => checkForOverflowBang("session", { value: big })).toThrow(CookieOverflow);
  });

  it("passes values at the boundary", () => {
    expect(() => checkForOverflowBang("session", { value: "x".repeat(4096) })).not.toThrow();
  });
});
