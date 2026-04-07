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

  it("tableNameLength", () => {
    expect(tableNameLength()).toBe(maxIdentifierLength());
  });

  it("tableAliasLength", () => {
    expect(tableAliasLength()).toBe(maxIdentifierLength());
  });

  it("indexNameLength", () => {
    expect(indexNameLength()).toBe(maxIdentifierLength());
  });

  it("bindParamsLength", () => {
    expect(bindParamsLength()).toBe(65535);
  });
});
