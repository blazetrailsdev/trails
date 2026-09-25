import { describe, it, expect } from "vitest";
import { SubclassNotFound } from "./errors.js";
import { VerySpecialClient } from "./test-helpers/models/company.js";

describe("new() STI dispatch gate", () => {
  it("raises SubclassNotFound for a bad type on a cold STI leaf", () => {
    expect(VerySpecialClient._hasAttribute("type")).toBe(false);

    expect(() => VerySpecialClient.new({ type: "InvalidType" })).toThrow(SubclassNotFound);
  });
});
