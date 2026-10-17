import { describe, expect, it } from "vitest";
import { tsConstantRenameKey } from "./constant-renames.js";

describe("tsConstantRenameKey", () => {
  it("resolves a fully qualified constant", () => {
    expect(tsConstantRenameKey("ActiveModel::Type::String")).toBe("ActiveModel::Type::String");
    expect(tsConstantRenameKey("::ActiveModel::Type::String")).toBe("ActiveModel::Type::String");
  });

  it("resolves a relative reference against its lexical scopes", () => {
    expect(tsConstantRenameKey("Value", "ActiveModel::Type")).toBe("ActiveModel::Type::Value");
    expect(tsConstantRenameKey("OID::Range", "ActiveRecord::ConnectionAdapters::PostgreSQL")).toBe(
      "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Range",
    );
  });

  it("falls back to the one key a qualified reference is a suffix of", () => {
    expect(tsConstantRenameKey("Type::Value", "ActiveRecord::Type")).toBe(
      "ActiveModel::Type::Value",
    );
  });

  it("leaves constants outside the table alone", () => {
    expect(tsConstantRenameKey("Json", "ActiveRecord::Type")).toBeUndefined();
    expect(tsConstantRenameKey("::String")).toBeUndefined();
    expect(tsConstantRenameKey("String", "ActiveRecord::Encryption")).toBeUndefined();
  });
});
