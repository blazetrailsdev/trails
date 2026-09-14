import { describe, expect, it } from "vitest";
import { Uuid } from "./uuid.js";

describe("PostgreSQL::OID::Uuid", () => {
  const type = new Uuid();

  it("reports :uuid as its type", () => {
    expect(type.type()).toBe("uuid");
  });

  it("casts a canonical UUID unchanged", () => {
    expect(type.cast("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")).toBe(
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
  });

  it("normalises an uppercase UUID", () => {
    expect(type.cast("A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11")).toBe(
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
  });

  it("normalises a braced UUID", () => {
    expect(type.cast("{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}")).toBe(
      "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    );
  });

  it("returns null for invalid values", () => {
    expect(type.cast("not-a-uuid")).toBeNull();
    expect(type.cast("")).toBeNull();
  });

  it("rejects UUIDs with unbalanced braces", () => {
    expect(type.cast("{a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11")).toBeNull();
    expect(type.cast("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11}")).toBeNull();
  });

  it("serialize is aliased to deserialize", () => {
    const value = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
    expect(type.serialize(value)).toBe(type.deserialize(value));
  });

  it("changed? compares by class and value", () => {
    expect(type.isChanged("a", "a")).toBe(false);
    expect(type.isChanged("a", "b")).toBe(true);
    expect(type.isChanged("a", 1)).toBe(true);
  });

  it("changed_in_place? compares raw old and new", () => {
    expect(type.isChangedInPlace("a", "a")).toBe(false);
    expect(type.isChangedInPlace("a", "b")).toBe(true);
  });
});
