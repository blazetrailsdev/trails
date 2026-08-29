import { describe, it, expect } from "vitest";
import { SubclassNotFound } from "./errors.js";
import { DeadParrot } from "./test-helpers/models/parrot.js";

describe("new() STI dispatch gate", () => {
  it("raises SubclassNotFound for a bad type on a cold STI leaf", () => {
    expect(DeadParrot._hasAttribute("parrot_sti_class")).toBe(false);

    expect(() => DeadParrot.new({ parrot_sti_class: "InvalidType" })).toThrow(SubclassNotFound);
  });
});
