import { describe, it, expect } from "vitest";
import { Contact } from "./test-helpers/models/contact.js";
import { Model } from "./model.js";

describe("ConversionTest", () => {
  it("to_partial_path is cached per class, not inherited by a subclass", () => {
    class Subcontact extends Contact {}
    expect(new Contact({}).toPartialPath()).toEqual("contacts/contact");
    expect(new Subcontact({}).toPartialPath()).toEqual("subcontacts/subcontact");
  });

  it("a model subclass overrides Conversion's methods with methods", () => {
    class Audit extends Model {
      override toParam(): string {
        return "slug";
      }
      override toKey(): unknown[] | null {
        return ["k"];
      }
      override toPartialPath(): string {
        return "audits/audit";
      }
    }
    const audit = new Audit();
    expect(audit.toParam()).toEqual("slug");
    expect(audit.toKey()).toEqual(["k"]);
    expect(audit.toPartialPath()).toEqual("audits/audit");
  });
});
