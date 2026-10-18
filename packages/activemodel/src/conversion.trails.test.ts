import { describe, it, expect } from "vitest";
import { Contact } from "./test-helpers/models/contact.js";

describe("ConversionTest", () => {
  it("to_partial_path is cached per class, not inherited by a subclass", () => {
    class Subcontact extends Contact {}
    expect(new Contact({}).toPartialPath()).toEqual("contacts/contact");
    expect(new Subcontact({}).toPartialPath()).toEqual("subcontacts/subcontact");
  });
});
