import { describe, it, expect } from "vitest";
import { Properties } from "./properties.js";
import { EncryptedContentIntegrity, ForbiddenClass } from "./errors.js";

describe("ActiveRecord::EncryptionPropertiesTest", () => {
  it("behaves like a hash", () => {
    const props = new Properties({ a: "1", b: "2" });
    expect(props.get("a")).toBe("1");
    expect(props.get("b")).toBe("2");
    expect(props.has("a")).toBe(true);
    expect(props.has("c")).toBe(false);
  });

  it("defines custom accessors for some default properties", () => {
    const props = new Properties();
    props.set("iv", "test-iv");
    props.set("at", "test-at");
    expect(props.iv).toBe("test-iv");
    expect(props.authTag).toBe("test-at");
  });

  it("raises EncryptedContentIntegrity when trying to override properties", () => {
    const props = new Properties();
    props.set("key", "value");
    expect(() => props.set("key", "other")).toThrow(EncryptedContentIntegrity);
  });

  it("add will add all the properties passed", () => {
    const props = new Properties();
    props.add({ a: "1", b: "2" });
    expect(props.get("a")).toBe("1");
    expect(props.get("b")).toBe("2");
  });

  it("validate allowed types on creation", () => {
    expect(() => new Properties({ a: {} as any })).toThrow(ForbiddenClass);
  });

  it("validate allowed_types setting headers", () => {
    const props = new Properties();
    expect(() => props.set("a", {} as any)).toThrow(ForbiddenClass);
  });
});
