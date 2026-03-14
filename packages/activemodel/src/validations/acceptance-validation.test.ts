import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("AcceptanceValidationTest", () => {
  it("eula", () => {
    class Person extends Model {
      static {
        this.attribute("eula", "string");
        this.validates("eula", { acceptance: true });
      }
    }
    const p = new Person({ eula: "0" });
    expect(p.isValid()).toBe(false);
    const p2 = new Person({ eula: "1" });
    expect(p2.isValid()).toBe(true);
  });

  it("lazy attribute module included only once", () => {
    class Person extends Model {
      static {
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    const p = new Person({ terms: true });
    expect(p.isValid()).toBe(true);
  });

  it("lazy attributes module included again if needed", () => {
    class Person extends Model {
      static {
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    const p = new Person({ terms: false });
    p.isValid();
    expect(p.errors.count).toBeGreaterThan(0);
  });

  it("lazy attributes respond to?", () => {
    class Person extends Model {
      static {
        this.attribute("terms", "boolean");
        this.validates("terms", { acceptance: true });
      }
    }
    const p = new Person({});
    expect(p.hasAttribute("terms")).toBe(true);
  });

  it("terms of service agreement no acceptance", () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    expect(new Terms({ terms: "0" }).isValid()).toBe(false);
  });

  it("terms of service agreement", () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    expect(new Terms({ terms: "1" }).isValid()).toBe(true);
  });

  it("terms of service agreement with accept value", () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: ["yes", "I agree"] } });
      }
    }
    expect(new Terms({ terms: "yes" }).isValid()).toBe(true);
    expect(new Terms({ terms: "no" }).isValid()).toBe(false);
  });

  it("terms of service agreement with multiple accept values", () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: { accept: ["1", "yes", "true"] } });
      }
    }
    expect(new Terms({ terms: "1" }).isValid()).toBe(true);
    expect(new Terms({ terms: "yes" }).isValid()).toBe(true);
    expect(new Terms({ terms: "true" }).isValid()).toBe(true);
    expect(new Terms({ terms: "no" }).isValid()).toBe(false);
  });

  it("validates acceptance of true", () => {
    class Terms extends Model {
      static {
        this.attribute("terms", "string");
        this.validates("terms", { acceptance: true });
      }
    }
    expect(new Terms({ terms: true }).isValid()).toBe(true);
  });

  it("validates acceptance of for ruby class", () => {
    class Person extends Model {}
    Person.attribute("terms", "string");
    Person.validates("terms", { acceptance: true });
    const p = new Person({ terms: "no" });
    expect(p.isValid()).toBe(false);
    const p2 = new Person({ terms: "1" });
    expect(p2.isValid()).toBe(true);
  });
});
