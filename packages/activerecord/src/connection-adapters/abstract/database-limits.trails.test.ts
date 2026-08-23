import { describe, it, expect } from "vitest";
import {
  maxIdentifierLength,
  tableNameLength,
  tableAliasLength,
  indexNameLength,
  bindParamsLength,
} from "./database-limits.js";

describe("DatabaseLimits", () => {
  it("maxIdentifierLength", () => {
    expect(maxIdentifierLength()).toBe(64);
  });

  const host = { maxIdentifierLength };

  it("tableNameLength", () => {
    expect(tableNameLength.call(host)).toBe(maxIdentifierLength());
  });

  it("tableAliasLength", () => {
    expect(tableAliasLength.call(host)).toBe(maxIdentifierLength());
  });

  it("indexNameLength", () => {
    expect(indexNameLength.call(host)).toBe(maxIdentifierLength());
  });

  it("tableNameLength, tableAliasLength, indexNameLength dispatch to the receiver's maxIdentifierLength", () => {
    const overridden = { maxIdentifierLength: () => 30 };
    expect(tableNameLength.call(overridden)).toBe(30);
    expect(tableAliasLength.call(overridden)).toBe(30);
    expect(indexNameLength.call(overridden)).toBe(30);
  });

  it("bindParamsLength", () => {
    expect(bindParamsLength()).toBe(65535);
  });
});
