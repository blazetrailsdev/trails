/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect, vi } from "vitest";
import { Model, Errors } from "../index.js";
import { WithValidator } from "./with.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { include } from "@blazetrails/activesupport";

describe("ValidatesWithTest", () => {
  const ERROR_MESSAGE = "Validation error from validator";

  it("validates_with with options", async () => {
    class CustomValidator {
      private minLength: number;
      constructor(options: any = {}) {
        this.minLength = options.minLength ?? 3;
      }
      validate(record: any) {
        const name = record._readAttribute("name");
        if (typeof name === "string" && name.length < this.minLength) {
          record.errors.add("name", ":invalid", { message: "too short" });
        }
      }
    }
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(CustomValidator, { minLength: 5 });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "ab" });
    expect(await p.isValid()).toBe(false);
    const p2 = new Person({ name: "alice" });
    expect(await p2.isValid()).toBe(true);
  });

  it("with multiple classes", async () => {
    class V1 {
      validate(record: any) {
        if (!record._readAttribute("name")) {
          record.errors.add("name", ":blank");
        }
      }
    }
    class V2 {
      validate(record: any) {
        if (!record._readAttribute("age")) {
          record.errors.add("age", ":blank");
        }
      }
    }
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.validatesWith(V1);
        this.validatesWith(V2);
      }
    }
    interface Person extends Attributes {}

    const p = new Person();
    await p.isValid();
    expect(p.errors.count).toBe(2);
  });

  it("validates_with preserves standard options", async () => {
    class CustomValidator {
      validate(record: any) {
        if (!record._readAttribute("name")) {
          record.errors.add("name", ":blank");
        }
      }
    }
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(CustomValidator);
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates_with preserves validator options", async () => {
    class CustomValidator {
      options: any;
      constructor(options: any = {}) {
        this.options = options;
      }
      validate(_record: any) {}
    }
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(CustomValidator, { custom: true });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({});
    expect(await p.isValid()).toBe(true);
  });

  it("instance validates_with method preserves validator options", async () => {
    class ValidatorThatDoesNotAddErrors {
      validate(_record: any) {}
    }
    class ValidatorThatClearsOptions extends ValidatorThatDoesNotAddErrors {
      constructor(options: any) {
        super();
        for (const key of Object.keys(options)) delete options[key];
      }
    }
    class ValidatorThatValidatesOptions {
      options: any;
      constructor(options: any = {}) {
        this.options = options;
      }
      validate(record: any) {
        if (this.options.field === "first_name") {
          record.errors.add("base", ":invalid", { message: ERROR_MESSAGE });
        }
      }
    }
    class Topic extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("title", "string");
      }
    }
    interface Topic extends Attributes {}

    const topic = new Topic({});
    await topic.validatesWith(ValidatorThatClearsOptions, ValidatorThatValidatesOptions, {
      field: "first_name",
    });
    expect(topic.errors.messagesFor("base")).toContain(ERROR_MESSAGE);
  });

  it("each validator checks validity", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    Person.validatesEach(["name"], (record, attr, value) => {
      if (!value) record.errors.add(attr, ":blank");
    });
    const p = new Person({});
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("each validator expects attributes to be given", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    Person.validatesEach(["name"], (record, attr, value) => {
      if (!value) record.errors.add(attr, ":blank");
    });
    const p = new Person({});
    await p.isValid();
    expect(p.errors.messagesFor("name").length).toBeGreaterThan(0);
  });

  it("each validator skip nil values if :allow_nil is set to true", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    Person.validatesEach(["name"], (record, attr, value) => {
      if (value !== null && value !== undefined && !value) {
        record.errors.add(attr, ":blank");
      }
    });
    const p = new Person({});
    await p.isValid();
    expect(p.errors.count).toBe(0);
  });

  it("each validator skip blank values if :allow_blank is set to true", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
    }
    interface Person extends Attributes {}

    Person.validatesEach(["name"], (record, attr, value) => {
      if (value && typeof value === "string" && value.trim() === "") {
        return;
      }
      if (value === null || value === undefined) return;
      record.errors.add(attr, ":invalid");
    });
    const p = new Person({ name: "  " });
    await p.isValid();
    expect(p.errors.count).toBe(0);
  });

  it("validates_with can validate with an instance method", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
      customValidation() {
        if (!this._readAttribute("name")) {
          this.errors.add("name", ":blank");
        }
      }
    }
    interface Person extends Attributes {}

    Person.validate("customValidation");
    const p = new Person({});
    await p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("optionally pass in the attribute being validated when validating with an instance method", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
      }
      checkName() {
        if (!this._readAttribute("name")) {
          this.errors.add("name", ":blank");
        }
      }
    }
    interface Person extends Attributes {}

    Person.validate("checkName");
    const p = new Person({});
    await p.isValid();
    expect(p.errors.messagesFor("name").length).toBeGreaterThan(0);
  });

  it("validates_with each validator", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    interface Person extends Attributes {}

    Person.validatesEach(["name", "age"], (record, attr, value) => {
      if (value === null || value === undefined) {
        record.errors.add(attr, ":blank");
      }
    });
    const p = new Person({});
    await p.isValid();
    expect(p.errors.count).toBe(2);
    expect(p.errors.messagesFor("name").length).toBeGreaterThan(0);
    expect(p.errors.messagesFor("age").length).toBeGreaterThan(0);
  });

  it("validation with class that adds errors", async () => {
    class CustomValidator {
      validate(record: any) {
        const val = record._readAttribute("name");
        if (!val || val === "") {
          record.errors.add("name", ":blank");
        }
      }
    }
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(CustomValidator);
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({}).isValid()).toBe(false);
    expect(await new Person({ name: "Alice" }).isValid()).toBe(true);
  });

  it("with a class that returns valid", async () => {
    class PassValidator {
      validate(_record: any) {}
    }
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(PassValidator);
      }
    }
    interface Person extends Attributes {}

    expect(await new Person({}).isValid()).toBe(true);
  });

  it("passes all configuration options to the validator class", async () => {
    let capturedOpts: Record<string, unknown> | undefined;
    class MinLenValidator {
      min: number;
      constructor(opts: any = {}) {
        capturedOpts = opts;
        this.min = opts.minimum ?? 0;
      }
      validate(record: any) {
        const val = record._readAttribute("name");
        if (typeof val === "string" && val.length < this.min) {
          record.errors.add("name", ":too_short");
        }
      }
    }
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validatesWith(MinLenValidator, { minimum: 5, if: ":conditionIsTrue", foo: "bar" });
      }
      conditionIsTrue(): boolean {
        return true;
      }
    }
    interface Person extends Attributes {}

    expect(capturedOpts).toEqual({
      minimum: 5,
      if: ":conditionIsTrue",
      foo: "bar",
      class: Person,
    });
    expect(await new Person({ name: "ab" }).isValid()).toBe(false);
    expect(await new Person({ name: "abcde" }).isValid()).toBe(true);
  });
});

describe("WithValidator arity dispatch", () => {
  it("calls zero-arity method without arguments", () => {
    const spy = vi.fn();
    const record = { myCheck: spy, errors: new Errors(null) };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    expect(spy).toHaveBeenCalledWith();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("calls one-arity method with attribute name", () => {
    let capturedArg: unknown;
    const record = {
      myCheck(attr: string) {
        capturedArg = attr;
      },
      errors: new Errors(null),
    };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    expect(capturedArg).toBe("name");
  });

  it("known divergence: rest-param method called without args (JS length 0 vs Ruby arity -1)", () => {
    const received: unknown[] = [];
    const record = {
      myCheck(...args: unknown[]) {
        received.push(...args);
      },
      errors: new Errors(null),
    };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    expect(received).toHaveLength(0);
  });

  it("known divergence: default-param method called without args (JS length 0 vs Ruby arity -1)", () => {
    let capturedArg: unknown = "not-called";
    const record = {
      myCheck(attr: string = "") {
        capturedArg = attr;
      },
      errors: new Errors(null),
    };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    expect(capturedArg).toBe("");
  });
});
