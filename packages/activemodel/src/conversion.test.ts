import { describe, it, expect } from "vitest";
import { Model } from "./index.js";
import { ModelName } from "./naming.js";

// models/contact.rb — `attr_accessor :id` plus `persisted? { id }`.
class Contact extends Model {
  static {
    this.attribute("id");
  }
  override isPersisted(): boolean {
    return this._readAttribute("id") != null;
  }
}

// models/helicopter.rb — `Helicopter`, `Helicopter::Comanche` and
// `Helicopter::Apache`, the last overriding `model_name`. A TS class name
// cannot contain `::`, so the qualified names are spelled on `ModelName`,
// which is where Rails' `_to_partial_path` reads them from anyway.
class Helicopter extends Model {}

class Comanche extends Model {
  static override get modelName(): ModelName {
    return new ModelName("Helicopter::Comanche");
  }
}

class Apache extends Model {
  static override get modelName(): ModelName {
    const modelName = new ModelName("Helicopter::Apache");
    modelName.collection = "attack_helicopters";
    modelName.element = "ah-64";
    return modelName;
  }
}

describe("ConversionTest", () => {
  it("to_model default implementation returns self", () => {
    const contact = new Contact({});
    expect(contact.toModel()).toEqual(contact);
  });

  it("to_key default implementation returns nil for new records", () => {
    expect(new Contact({}).toKey()).toBeNull();
  });

  it("to_key default implementation returns the id in an array for persisted records", () => {
    expect(new Contact({ id: 1 }).toKey()).toEqual([1]);
  });

  it("to_key doesn't double-wrap composite `id`s", () => {
    expect(new Contact({ id: ["abc", "xyz"] }).toKey()).toEqual(["abc", "xyz"]);
  });

  it("to_param default implementation returns nil for new records", () => {
    expect(new Contact({}).toParam()).toBeNull();
  });

  it("to_param default implementation returns a string of ids for persisted records", () => {
    expect(new Contact({ id: 1 }).toParam()).toEqual("1");
  });

  it("to_param returns the string joined by '-'", () => {
    expect(new Contact({ id: ["abc", "xyz"] }).toParam()).toEqual("abc-xyz");
  });

  it("to_param returns nil if composite id is incomplete", () => {
    expect(new Contact({ id: [1, null] }).toParam()).toBeNull();
  });

  it("to_param returns nil if to_key is nil", () => {
    class Klass extends Contact {
      override isPersisted(): boolean {
        return true;
      }
    }

    expect(new Klass({}).toParam()).toBeNull();
  });

  it("to_partial_path default implementation returns a string giving a relative path", () => {
    expect(new Contact({}).toPartialPath()).toEqual("contacts/contact");
    expect(new Helicopter({}).toPartialPath()).toEqual("helicopters/helicopter");
  });

  it("to_partial_path handles namespaced models", () => {
    expect(new Comanche({}).toPartialPath()).toEqual("helicopter/comanches/comanche");
  });

  it("to_partial_path handles non-standard model_name", () => {
    expect(new Apache({}).toPartialPath()).toEqual("attack_helicopters/ah-64");
  });

  it("#to_param_delimiter allows redefining the delimiter used in #to_param", () => {
    const oldDelimiter = Contact.paramDelimiter;
    Contact.paramDelimiter = "_";
    try {
      expect(new Contact({ id: ["abc", "xyz"] }).toParam()).toEqual("abc_xyz");
    } finally {
      Contact.paramDelimiter = oldDelimiter;
    }
  });

  it("#to_param_delimiter is defined per class", () => {
    const oldContactDelimiter = Contact.paramDelimiter;
    class CustomContract extends Contact {}

    Contact.paramDelimiter = "_";
    CustomContract.paramDelimiter = ";";

    try {
      expect(new Contact({ id: ["abc", "xyz"] }).toParam()).toEqual("abc_xyz");
      expect(new CustomContract({ id: ["abc", "xyz"] }).toParam()).toEqual("abc;xyz");
    } finally {
      Contact.paramDelimiter = oldContactDelimiter;
    }
  });
});
