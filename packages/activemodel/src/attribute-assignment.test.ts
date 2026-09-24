/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   The test model below spells `include ActiveModel::AttributeAssignment` in its class body, the way
   the Rails test model it mirrors does (attribute_assignment_test.rb:5-23); the class/interface
   merge beside it is how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { include, assertRaises } from "@blazetrails/activesupport";
import { ArgumentError, StandardError } from "@blazetrails/ruby-compat";
import {
  type AttributeAssignment,
  assignAttributes,
  setAttributes,
  attributeWriterMissing,
  _assignAttributes,
  _assignAttribute,
} from "./attribute-assignment.js";
import { ForbiddenAttributesProtection } from "./forbidden-attributes-protection.js";
import { ForbiddenAttributesError } from "./forbidden-attributes-protection.js";
import { UnknownAttributeError } from "./errors.js";

class Model {
  declare _name?: string;
  declare _description?: string;

  constructor(attributes: unknown = {}) {
    this.assignAttributes(attributes);
  }

  get name(): string | undefined {
    return this._name;
  }

  set name(value: string | undefined) {
    this._name = value;
  }

  get description(): string | undefined {
    return this._description;
  }

  set description(value: string | undefined) {
    this._description = value;
  }

  set brokenAttribute(_value: unknown) {
    throw new ErrorFromAttributeWriter();
  }

  static {
    include(this, {
      assignAttributes,
      setAttributes,
      attributeWriterMissing,
      _assignAttributes,
      _assignAttribute,
    });
    include(this, ForbiddenAttributesProtection);
  }
}
interface Model extends AttributeAssignment {
  assignAttributes(newAttributes: unknown): void;
  setAttributes(newAttributes: unknown): Promise<void> | void;
}

class ErrorFromAttributeWriter extends StandardError {}

class ProtectedParams {
  private parameters: Record<string, unknown>;
  private _permitted = false;

  constructor(attributes: Record<string, unknown>) {
    this.parameters = attributes;
  }

  permitted(): boolean {
    return this._permitted;
  }

  permitBang(): this {
    this._permitted = true;
    return this;
  }

  get empty(): boolean {
    return Object.keys(this.parameters).length === 0;
  }

  toH(): Record<string, unknown> {
    return this.parameters;
  }
}

describe("AttributeAssignmentTest", () => {
  it("simple assignment", () => {
    const model = new Model();

    model.assignAttributes({ name: "hello", description: "world" });
    expect(model.name).toEqual("hello");
    expect(model.description).toEqual("world");
  });

  it("simple assignment alias", () => {
    const model = new Model();

    void model.setAttributes({ name: "hello", description: "world" });
    expect(model.name).toEqual("hello");
    expect(model.description).toEqual("world");
  });

  it("assign non-existing attribute", async () => {
    const model = new Model();
    const error = (await assertRaises([UnknownAttributeError], {}, () => {
      model.assignAttributes({ hz: 1 });
    })) as UnknownAttributeError;

    expect(error.record).toEqual(model);
    expect(error.attribute).toEqual("hz");
  });

  it("assign non-existing attribute by overriding #attribute_writer_missing", () => {
    class modelClass extends Model {
      declare _assignedAttributes?: Record<string, unknown>;

      get assignedAttributes(): Record<string, unknown> {
        return this._assignedAttributes!;
      }

      set assignedAttributes(value: Record<string, unknown>) {
        this._assignedAttributes = value;
      }

      override attributeWriterMissing(name: string, value: unknown): void {
        this.assignedAttributes[name] = value;
      }
    }
    const model = new modelClass({ assignedAttributes: {} });

    model.assignAttributes({ unknown: "attribute" });

    expect(model.assignedAttributes).toEqual({ unknown: "attribute" });
  });

  it("assign private attribute", async () => {
    const model = new Model();
    await assertRaises([UnknownAttributeError], {}, () => {
      model.assignAttributes({ metadata: { a: 1 } });
    });
  });

  it("does not swallow errors raised in an attribute writer", async () => {
    await assertRaises([ErrorFromAttributeWriter], {}, () => {
      new Model({ brokenAttribute: 1 });
    });
  });

  it("an ArgumentError is raised if a non-hash-like object is passed", async () => {
    const err = (await assertRaises([ArgumentError], {}, () => {
      new Model(1);
    })) as ArgumentError;

    expect(err.message).toEqual(
      "When assigning attributes, you must pass a hash as an argument, Integer passed.",
    );
  });

  it("forbidden attributes cannot be used for mass assignment", async () => {
    const params = new ProtectedParams({ name: "Guille", description: "m" });

    await assertRaises([ForbiddenAttributesError], {}, () => {
      new Model(params);
    });
  });

  it("permitted attributes can be used for mass assignment", () => {
    const params = new ProtectedParams({ name: "Guille", description: "desc" });
    params.permitBang();
    const model = new Model(params);

    expect(model.name).toEqual("Guille");
    expect(model.description).toEqual("desc");
  });

  it("regular hash should still be used for mass assignment", () => {
    const model = new Model({ name: "Guille", description: "m" });

    expect(model.name).toEqual("Guille");
    expect(model.description).toEqual("m");
  });

  it("assigning no attributes should not raise, even if the hash is un-permitted", () => {
    const model = new Model();
    expect(model.assignAttributes(new ProtectedParams({}))).toBeUndefined();
  });

  it("passing an object with each_pair but without each", () => {
    const model = new Model();
    const h = { name: "hello", description: "world" };
    model.assignAttributes(h);

    expect(model.name).toEqual("hello");
    expect(model.description).toEqual("world");
  });
});
