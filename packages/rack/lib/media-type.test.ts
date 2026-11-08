import { describe, it, expect } from "vitest";
import { MediaType } from "./media-type.js";

describe("when content_type nil", () => {
  it("#type is nil", () => {
    expect(MediaType.type(null)).toBeNull();
  });

  it("#params is empty", () => {
    expect(MediaType.params(null)).toEqual({});
  });
});

describe("when content_type is empty string", () => {
  it("#type is nil", () => {
    expect(MediaType.type("")).toBeNull();
  });

  it("#params is empty", () => {
    expect(MediaType.params("")).toEqual({});
  });
});

describe("when content_type contains only media_type", () => {
  it("#type is application/text", () => {
    expect(MediaType.type("application/text")).toBe("application/text");
  });

  it("#params is empty", () => {
    expect(MediaType.params("application/text")).toEqual({});
  });
});

describe("when content_type contains media_type and params", () => {
  it("#type is application/text", () => {
    expect(MediaType.type('application/text;CHARSET="utf-8"')).toBe("application/text");
  });

  it('#params has key "charset" with value "utf-8"', () => {
    expect(MediaType.params('application/text;CHARSET="utf-8"')["charset"]).toBe("utf-8");
  });
});

describe("when content_type contains media_type and incomplete params", () => {
  it("#type is application/text", () => {
    expect(MediaType.type("application/text;CHARSET")).toBe("application/text");
  });

  it('#params has key "charset" with value ""', () => {
    expect(MediaType.params("application/text;CHARSET")["charset"]).toBe("");
  });
});

describe("when content_type contains media_type and empty params", () => {
  it("#type is application/text", () => {
    expect(MediaType.type("application/text;CHARSET=")).toBe("application/text");
  });

  it('#params has key "charset" with value of empty string', () => {
    expect(MediaType.params("application/text;CHARSET=")["charset"]).toBe("");
  });
});
