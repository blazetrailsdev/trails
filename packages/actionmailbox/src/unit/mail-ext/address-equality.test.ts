import { describe, expect, it } from "vitest";
import { Address } from "@blazetrails/mail";
import { rbEqual } from "@blazetrails/ruby-compat";
import "../../mail-ext.js";

describe("AddressEqualityTest", () => {
  it("two addresses with the same address are equal", () => {
    expect(rbEqual(new Address("david@basecamp.com"), new Address("david@basecamp.com"))).toBe(
      true,
    );
  });
});
