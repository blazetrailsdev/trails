import { describe, it, expect } from "vitest";
import { Properties } from "./properties.js";
import { EncryptedContentIntegrity, ForbiddenClass } from "./errors.js";

describe("ActiveRecord::EncryptionPropertiesTest", () => {
  it("behaves like a hash", () => {
    const props = new Properties();
    props.set("key_1", "value 1");
    props.set("key_2", "value 2");
    expect(props.get("key_1")).toBe("value 1");
    expect(props.get("key_2")).toBe("value 2");
  });

  it("defines custom accessors for some default properties", () => {
    const authTag = "some auth tag";
    const props = new Properties();
    props.set("at", authTag);
    expect(props.authTag).toBe(authTag);
    expect(props.get("at")).toBe(authTag);
  });

  it("raises EncryptedContentIntegrity when trying to override properties", () => {
    const props = new Properties();
    props.set("key_1", "value 1");
    expect(() => props.set("key_1", "value 1")).toThrow(EncryptedContentIntegrity);
  });

  it("add will add all the properties passed", () => {
    const props = new Properties();
    props.add({ key_1: "value 1", key_2: "value 2" });
    expect(props.get("key_1")).toBe("value 1");
    expect(props.get("key_2")).toBe("value 2");
  });

  it("validate allowed types on creation", () => {
    expect(() => new Properties({ a: {} as any })).toThrow(ForbiddenClass);
  });

  it("validate allowed_types setting headers", () => {
    const props = new Properties();
    expect(() => props.set("a", {} as any)).toThrow(ForbiddenClass);
  });
});
