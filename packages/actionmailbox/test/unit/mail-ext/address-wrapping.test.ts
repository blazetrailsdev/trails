import { describe, expect, it } from "vitest";
import { Address } from "@blazetrails/mail";
import "../../../lib/mail-ext.js";

describe("AddressWrappingTest", () => {
  it("wrap", () => {
    const needingWrapping = Address.wrap("david@basecamp.com");
    const wrappingNotNeeded = Address.wrap(new Address("david@basecamp.com"));
    expect(wrappingNotNeeded.address()).toEqual(needingWrapping.address());
  });
});
