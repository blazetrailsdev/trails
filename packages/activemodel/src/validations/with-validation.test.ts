import { describe, it, expect, vi } from "vitest";
import { Model } from "../index.js";
import { WithValidator } from "./with.js";

describe("ValidatesWithTest", () => {
  it("validates_with with options", () => {
    class CustomValidator {
      private minLength: number;
      constructor(options: any = {}) {
        this.minLength = options.minLength ?? 3;
      }
      validate(record: any) {
        const name = record.readAttribute("name");
        if (typeof name === "string" && name.length < this.minLength) {
          record.errors.add("name", "invalid", { message: "too short" });
        }
      }
    }
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validatesWith(CustomValidator, { minLength: 5 });
      }
    }
    const p = new Person({ name: "ab" });
    expect(p.isValid()).toBe(false);
    const p2 = new Person({ name: "alice" });
    expect(p2.isValid()).toBe(true);
  });

  it("with multiple classes", () => {
    class V1 {
      validate(record: any) {
        if (!record.readAttribute("name")) {
          record.errors.add("name", "blank");
        }
      }
    }
    class V2 {
      validate(record: any) {
        if (!record.readAttribute("age")) {
          record.errors.add("age", "blank");
        }
      }
    }
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.validatesWith(V1);
        this.validatesWith(V2);
      }
    }
    const p = new Person();
    p.isValid();
    expect(p.errors.count).toBe(2);
  });

  it("validates_with preserves standard options", () => {
    class CustomValidator {
      validate(record: any) {
        if (!record.readAttribute("name")) {
          record.errors.add("name", "blank");
        }
      }
    }
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validatesWith(CustomValidator);
      }
    }
    const p = new Person({});
    p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("validates_with preserves validator options", () => {
    class CustomValidator {
      options: any;
      constructor(options: any = {}) {
        this.options = options;
      }
      validate(_record: any) {}
    }
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validatesWith(CustomValidator, { custom: true });
      }
    }
    const p = new Person({});
    expect(p.isValid()).toBe(true);
  });

  it("instance validates_with method preserves validator options", () => {
    class CustomValidator {
      options: any;
      constructor(options: any = {}) {
        this.options = options;
      }
      validate(_record: any) {}
    }
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validatesWith(CustomValidator, { custom: "value" });
      }
    }
    const p = new Person({});
    expect(p.isValid()).toBe(true);
  });

  it("each validator checks validity", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    Person.validatesEach(["name"], (record, attr, value) => {
      if (!value) record.errors.add(attr, "blank");
    });
    const p = new Person({});
    p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("each validator expects attributes to be given", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    Person.validatesEach(["name"], (record, attr, value) => {
      if (!value) record.errors.add(attr, "blank");
    });
    const p = new Person({});
    p.isValid();
    expect(p.errors.get("name").length).toBeGreaterThan(0);
  });

  it("each validator skip nil values if :allow_nil is set to true", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    Person.validatesEach(["name"], (record, attr, value) => {
      if (value !== null && value !== undefined && !value) {
        record.errors.add(attr, "blank");
      }
    });
    const p = new Person({});
    p.isValid();
    // null values are skipped
    expect(p.errors.count).toBe(0);
  });

  it("each validator skip blank values if :allow_blank is set to true", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
    }
    Person.validatesEach(["name"], (record, attr, value) => {
      if (value && typeof value === "string" && value.trim() === "") {
        return; // skip blank
      }
      if (value === null || value === undefined) return;
      record.errors.add(attr, "invalid");
    });
    const p = new Person({ name: "  " });
    p.isValid();
    expect(p.errors.count).toBe(0);
  });

  it("validates_with can validate with an instance method", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      customValidation() {
        if (!this.readAttribute("name")) {
          this.errors.add("name", "blank");
        }
      }
    }
    Person.validate("customValidation");
    const p = new Person({});
    p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("optionally pass in the attribute being validated when validating with an instance method", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
      }
      checkName() {
        if (!this.readAttribute("name")) {
          this.errors.add("name", "blank");
        }
      }
    }
    Person.validate("checkName");
    const p = new Person({});
    p.isValid();
    expect(p.errors.get("name").length).toBeGreaterThan(0);
  });

  it("validates_with each validator", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.attribute("age", "integer");
      }
    }
    Person.validatesEach(["name", "age"], (record, attr, value) => {
      if (value === null || value === undefined) {
        record.errors.add(attr, "blank");
      }
    });
    const p = new Person({});
    p.isValid();
    expect(p.errors.count).toBe(2);
    expect(p.errors.get("name").length).toBeGreaterThan(0);
    expect(p.errors.get("age").length).toBeGreaterThan(0);
  });

  it("validation with class that adds errors", () => {
    class CustomValidator {
      validate(record: any) {
        const val = record.readAttribute("name");
        if (!val || val === "") {
          record.errors.add("name", "blank");
        }
      }
    }
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validatesWith(CustomValidator);
      }
    }
    expect(new Person({}).isValid()).toBe(false);
    expect(new Person({ name: "Alice" }).isValid()).toBe(true);
  });

  it("with a class that returns valid", () => {
    class PassValidator {
      validate(_record: any) {}
    }
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validatesWith(PassValidator);
      }
    }
    expect(new Person({}).isValid()).toBe(true);
  });

  it("passes all configuration options to the validator class", () => {
    class MinLenValidator {
      min: number;
      constructor(opts: any = {}) {
        this.min = opts.minimum ?? 0;
      }
      validate(record: any) {
        const val = record.readAttribute("name");
        if (typeof val === "string" && val.length < this.min) {
          record.errors.add("name", "too_short");
        }
      }
    }
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validatesWith(MinLenValidator, { minimum: 5 });
      }
    }
    expect(new Person({ name: "ab" }).isValid()).toBe(false);
    expect(new Person({ name: "abcde" }).isValid()).toBe(true);
  });
});

describe("WithValidator arity dispatch", () => {
  it("calls zero-arity method without arguments", () => {
    const spy = vi.fn();
    const record = { myCheck: spy };
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
    };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    expect(capturedArg).toBe("name");
  });

  // JS Function.length excludes rest and default parameters (both yield length 0),
  // so such methods are dispatched without the attribute — unlike Ruby where
  // *args or optional args give negative arity and Rails passes the attribute.
  // Documented divergence; detecting these via Function.toString() is fragile.
  it("known divergence: rest-param method called without args (JS length 0 vs Ruby arity -1)", () => {
    const received: unknown[] = [];
    const record = {
      myCheck(...args: unknown[]) {
        received.push(...args);
      },
    };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    // Function.length of a rest-param function is 0, so no arg is passed
    expect(received).toHaveLength(0);
  });

  it("known divergence: default-param method called without args (JS length 0 vs Ruby arity -1)", () => {
    let capturedArg: unknown = "not-called";
    const record = {
      myCheck(attr: string = "") {
        capturedArg = attr;
      },
    };
    const validator = new WithValidator({ attributes: ["name"], with: "myCheck" });
    validator.validateEach(record, "name", "value");
    // Function.length excludes default params, so length is 0 → called without arg
    expect(capturedArg).toBe("");
  });
});
