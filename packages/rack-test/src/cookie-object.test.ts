import { Time } from "@blazetrails/date";
import { escape } from "@blazetrails/rack";
import { describe, expect, it } from "vitest";
import { Cookie, CookieJar } from "./cookie-jar.js";

describe("Rack::Test::Cookie", () => {
  const value = "the cookie value";
  const domain = "www.example.org";
  const path = "/foo";
  const expires = Time.at(Time.now().toI() + 24 * 60 * 60).httpdate();
  const cookieString = [
    `cookie_name=${escape(value)}`,
    `domain=${domain}`,
    `path=${path}`,
    `expires=${expires}`,
  ].join(CookieJar.DELIMITER);

  const cookie = (trailer: string = ""): Cookie => new Cookie(cookieString + trailer);

  it("#to_h returns the cookie value and all options", () => {
    expect(cookie("; HttpOnly; secure").toH()).toEqual({
      value: value,
      domain: domain,
      path: path,
      expires: expires,
      HttpOnly: true,
      secure: true,
    });
  });

  it("#to_hash is an alias for #to_h", () => {
    expect(cookie().toHash()).toEqual(cookie().toH());
  });

  it("#empty? should only be true for empty values", () => {
    expect(cookie().isEmpty()).toBe(false);
    expect(new Cookie("value=").isEmpty()).toBe(true);
  });

  it("#valid? should consider the given URI scheme for secure cookies", () => {
    expect(cookie("; secure").isValid(new URL("https://www.example.org/"))).toBe(true);
    expect(cookie("; secure").isValid(new URL("httpx://www.example.org/"))).toBe(false);
    expect(cookie("; secure").isValid(new URL("/", "http://example.org/"))).toBe(false);
  });

  it("#valid? is indifferent to matching paths", () => {
    expect(cookie().isValid(new URL("https://www.example.org/foo"))).toBe(true);
    expect(cookie().isValid(new URL("https://www.example.org/bar"))).toBe(true);
  });

  it("#matches? demands matching paths", () => {
    expect(cookie().matches(new URL("https://www.example.org/foo"))).toBe(true);
    expect(cookie().matches(new URL("https://www.example.org/bar"))).toBe(false);
  });

  it("#http_only? for a non HTTP only cookie returns false", () => {
    expect(cookie().isHttpOnly()).toBe(false);
  });

  it("#http_only? for an HTTP only cookie returns true", () => {
    expect(cookie("; HttpOnly").isHttpOnly()).toBe(true);
  });

  it("#http_only? for an HTTP only cookie returns true", () => {
    expect(cookie("; httponly").isHttpOnly()).toBe(true);
  });
});
