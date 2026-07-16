import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

describe("ConditionalValidationTest", () => {
  it("if validation using block true", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, if: () => true });
      }
    }
    expect(await new Person({}).isValid()).toBe(false);
  });

  it("if validation using block false", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, if: () => false });
      }
    }
    expect(await new Person({}).isValid()).toBe(true);
  });

  it("unless validation using block true", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, unless: () => true });
      }
    }
    expect(await new Person({}).isValid()).toBe(true);
  });

  it("unless validation using block false", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, unless: () => false });
      }
    }
    expect(await new Person({}).isValid()).toBe(false);
  });

  it("validation using combining if true and unless true conditions", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, if: () => true, unless: () => true });
      }
    }
    // unless returns true, so validation is skipped
    expect(await new Person({}).isValid()).toBe(true);
  });

  it("validation using combining if true and unless false conditions", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, if: () => true, unless: () => false });
      }
    }
    // both conditions met, validation runs
    expect(await new Person({}).isValid()).toBe(false);
  });

  it("if validation using method true", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, if: "shouldValidateName" });
      }
      shouldValidateName() {
        return true;
      }
    }
    expect(await new Person({}).isValid()).toBe(false);
  });

  it("if validation using method false", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, if: "shouldValidateName" });
      }
      shouldValidateName() {
        return false;
      }
    }
    expect(await new Person({}).isValid()).toBe(true);
  });

  it("unless validation using method true", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, unless: "skipValidation" });
      }
      skipValidation() {
        return true;
      }
    }
    expect(await new Person({}).isValid()).toBe(true);
  });

  it("unless validation using method false", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, unless: "skipValidation" });
      }
      skipValidation() {
        return false;
      }
    }
    expect(await new Person({}).isValid()).toBe(false);
  });

  it("if validation using array of true methods", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, if: [() => true, () => true] });
      }
    }
    expect(await new Person({}).isValid()).toBe(false);
  });

  it("if validation using array of true and false methods", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, if: [() => true, () => false] });
      }
    }
    // One returns false, so validation is skipped
    expect(await new Person({}).isValid()).toBe(true);
  });

  it("unless validation using array of false methods", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, unless: [() => false, () => false] });
      }
    }
    // None return true, so validation runs
    expect(await new Person({}).isValid()).toBe(false);
  });

  it("unless validation using array of true and false methods", async () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true, unless: [() => true, () => false] });
      }
    }
    // One returns true, so validation is skipped
    expect(await new Person({}).isValid()).toBe(true);
  });
});
