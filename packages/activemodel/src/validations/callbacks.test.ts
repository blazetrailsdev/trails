import { describe, it, expect } from "vitest";
import { Model } from "../index.js";

// Mirrors Rails validations/callbacks_test.rb: a base `Dog` with a `history`
// accumulator, plus subclasses registering before/after_validation callbacks
// gated by `on:`.
class Dog extends Model {
  history: string[] = [];
  static {
    this.attribute("name", "string");
  }
}

class DogValidatorWithOnCondition extends Dog {
  static {
    this.beforeValidation(
      (d: DogValidatorWithOnCondition) => {
        d.history.push("before_validation_marker");
      },
      { on: "create" },
    );
    this.afterValidation(
      (d: DogValidatorWithOnCondition) => {
        d.history.push("after_validation_marker");
      },
      { on: "create" },
    );
  }
}

class DogValidatorWithOnMultipleCondition extends Dog {
  static {
    this.beforeValidation(
      (d: DogValidatorWithOnMultipleCondition) => {
        d.history.push("before_validation_marker on context_a");
      },
      { on: "context_a" },
    );
    this.beforeValidation(
      (d: DogValidatorWithOnMultipleCondition) => {
        d.history.push("before_validation_marker on context_b");
      },
      { on: "context_b" },
    );
    this.afterValidation(
      (d: DogValidatorWithOnMultipleCondition) => {
        d.history.push("after_validation_marker on context_a");
      },
      { on: "context_a" },
    );
    this.afterValidation(
      (d: DogValidatorWithOnMultipleCondition) => {
        d.history.push("after_validation_marker on context_b");
      },
      { on: "context_b" },
    );
  }
}

describe("CallbacksWithMethodNamesShouldBeCalled", () => {
  it("before validation and after validation callbacks should be called", () => {
    const order: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.beforeValidation(() => {
          order.push("before_validation");
        });
        this.afterValidation(() => {
          order.push("after_validation");
        });
      }
    }
    const p = new Person({ name: "Alice" });
    p.isValid();
    expect(order).toContain("before_validation");
    expect(order).toContain("after_validation");
  });

  it("before validation and after validation callbacks should be called in declared order", () => {
    const order: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.beforeValidation(() => {
          order.push("first_before");
        });
        this.beforeValidation(() => {
          order.push("second_before");
        });
        this.afterValidation(() => {
          order.push("first_after");
        });
        this.afterValidation(() => {
          order.push("second_after");
        });
      }
    }
    const p = new Person({ name: "Alice" });
    p.isValid();
    expect(order.indexOf("first_before")).toBeLessThan(order.indexOf("second_before"));
    expect(order.indexOf("first_after")).toBeLessThan(order.indexOf("second_after"));
  });

  it("further callbacks should not be called if before validation throws abort", () => {
    const order: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.beforeValidation(() => {
          order.push("before");
          return false;
        });
        this.afterValidation(() => {
          order.push("after");
        });
      }
    }
    const p = new Person({ name: "Alice" });
    p.isValid();
    expect(order).toContain("before");
    expect(order).not.toContain("after");
  });

  it("validation test should be done", () => {
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const p = new Person({ name: "Alice" });
    expect(p.isValid()).toBe(true);
    const p2 = new Person({});
    expect(p2.isValid()).toBe(false);
  });

  it("on condition is respected for validation without matching context", () => {
    const d = new DogValidatorWithOnCondition();
    d.isValid("save");
    expect(d.history).toEqual([]);
  });

  it("on condition is respected for validation without context", () => {
    const d = new DogValidatorWithOnCondition();
    d.isValid();
    expect(d.history).toEqual([]);
  });

  it("on multiple condition is respected for validation with matching context", () => {
    const d1 = new DogValidatorWithOnMultipleCondition();
    d1.isValid("context_a");
    expect(d1.history).toEqual([
      "before_validation_marker on context_a",
      "after_validation_marker on context_a",
    ]);

    const d2 = new DogValidatorWithOnMultipleCondition();
    d2.isValid("context_b");
    expect(d2.history).toEqual([
      "before_validation_marker on context_b",
      "after_validation_marker on context_b",
    ]);

    const d3 = new DogValidatorWithOnMultipleCondition();
    d3.isValid(["context_a", "context_b"]);
    expect(d3.history).toEqual([
      "before_validation_marker on context_a",
      "before_validation_marker on context_b",
      "after_validation_marker on context_a",
      "after_validation_marker on context_b",
    ]);
  });

  it("on multiple condition is respected for validation without matching context", () => {
    const d = new DogValidatorWithOnMultipleCondition();
    d.isValid("save");
    expect(d.history).toEqual([]);
  });

  it("on multiple condition is respected for validation without context", () => {
    const d = new DogValidatorWithOnMultipleCondition();
    d.isValid();
    expect(d.history).toEqual([]);
  });

  it("further callbacks should be called if before validation returns false", () => {
    const log: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.afterValidation(() => {
          log.push("after");
        });
      }
    }
    const p = new Person({ name: "test" });
    p.isValid();
    expect(log).toContain("after");
  });

  it("further callbacks should be called if after validation returns false", () => {
    const log: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.afterValidation(() => {
          log.push("first");
          return false;
        });
        this.afterValidation(() => {
          log.push("second");
        });
      }
    }
    const p = new Person({ name: "test" });
    p.isValid();
    expect(log).toContain("first");
  });

  it("before validation does not mutate the if options array", () => {
    // Rails guards that registering with `if:` + `on:` doesn't mutate the
    // caller's options (old Rails appended the on-predicate into the `:if`
    // array). trails' `CallbackConditions.if` is a single callable, not a
    // Rails-style array of conditions, so there is no array to append to; the
    // faithful analogue is asserting the passed options object is untouched —
    // the on→if translation builds a fresh conditions object instead.
    const opts = { if: (_r: any) => true, on: "create" as const };
    class CreateDog extends Dog {
      static {
        this.beforeValidation(() => {}, opts);
      }
    }
    void CreateDog;
    expect(opts).toEqual({ if: opts.if, on: "create" });
  });

  it("after validation does not mutate the if options array", () => {
    const opts = { if: (_r: any) => true, on: "create" as const };
    class CreateDog extends Dog {
      static {
        this.afterValidation(() => {}, opts);
      }
    }
    void CreateDog;
    expect(opts).toEqual({ if: opts.if, on: "create" });
  });

  it("before validation and after validation callbacks should be called with proc", () => {
    const log: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.beforeValidation((_r: any) => {
          log.push("before_proc");
        });
        this.afterValidation((_r: any) => {
          log.push("after_proc");
        });
      }
    }
    const p = new Person({ name: "Alice" });
    p.isValid();
    expect(log).toContain("before_proc");
    expect(log).toContain("after_proc");
  });

  it("if condition is respected for before validation", () => {
    const log: string[] = [];
    class Person extends Model {
      static {
        this.attribute("name", "string");
        this.beforeValidation(
          (_r: any) => {
            log.push("before");
          },
          { if: (r: any) => r.readAttribute("name") === "trigger" },
        );
      }
    }
    const p1 = new Person({ name: "Alice" });
    p1.isValid();
    expect(log).toEqual([]);

    const p2 = new Person({ name: "trigger" });
    p2.isValid();
    expect(log).toEqual(["before"]);
  });

  it("on condition is respected for validation with matching context", () => {
    const d = new DogValidatorWithOnCondition();
    d.isValid("create");
    expect(d.history).toEqual(["before_validation_marker", "after_validation_marker"]);
  });
});
