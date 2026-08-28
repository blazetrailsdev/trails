/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   Each model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect } from "vitest";
import { throwAbort, include } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { Callbacks as ValidationsCallbacks } from "./callbacks.js";

class Dog extends Model {
  declare static attribute: AttributesClassHalf["attribute"];
  declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
  declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];

  history: string[] = [];
  static {
    include(this, ValidationsCallbacks);
    include(this, Attributes);
    this.attribute("name", "string");
  }
}
interface Dog extends Attributes {}

class DogValidatorWithOnCondition extends Dog {
  declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
  declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
  static {
    include(this, ValidationsCallbacks);
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
  declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
  declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
  static {
    include(this, ValidationsCallbacks);
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
  it("before validation and after validation callbacks should be called", async () => {
    const order: string[] = [];
    class Person extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.beforeValidation(":setBeforeValidationMarker");
        this.afterValidation(":setAfterValidationMarker");
      }
      setBeforeValidationMarker(): void {
        order.push("before_validation");
      }
      setAfterValidationMarker(): void {
        order.push("after_validation");
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    await p.isValid();
    expect(order).toContain("before_validation");
    expect(order).toContain("after_validation");
  });

  it("before validation and after validation callbacks should be called in declared order", async () => {
    const order: string[] = [];
    class Person extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
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
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    await p.isValid();
    expect(order.indexOf("first_before")).toBeLessThan(order.indexOf("second_before"));
    expect(order.indexOf("first_after")).toBeLessThan(order.indexOf("second_after"));
  });

  it("further callbacks should not be called if before validation throws abort", async () => {
    const order: string[] = [];
    class Person extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
        this.attribute("name", "string");
        this.beforeValidation(() => {
          order.push("before");
          throwAbort();
        });
        this.afterValidation(() => {
          order.push("after");
        });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    await p.isValid();
    expect(order).toContain("before");
    expect(order).not.toContain("after");
  });

  it("validation test should be done", async () => {
    class Person extends Model {
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, Attributes);
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    expect(await p.isValid()).toBe(true);
    const p2 = new Person({});
    expect(await p2.isValid()).toBe(false);
  });

  it("on condition is respected for validation without matching context", async () => {
    const d = new DogValidatorWithOnCondition();
    await d.isValid("save");
    expect(d.history).toEqual([]);
  });

  it("on condition is respected for validation without context", async () => {
    const d = new DogValidatorWithOnCondition();
    await d.isValid();
    expect(d.history).toEqual([]);
  });

  it("on multiple condition is respected for validation with matching context", async () => {
    const d1 = new DogValidatorWithOnMultipleCondition();
    await d1.isValid("context_a");
    expect(d1.history).toEqual([
      "before_validation_marker on context_a",
      "after_validation_marker on context_a",
    ]);

    const d2 = new DogValidatorWithOnMultipleCondition();
    await d2.isValid("context_b");
    expect(d2.history).toEqual([
      "before_validation_marker on context_b",
      "after_validation_marker on context_b",
    ]);

    const d3 = new DogValidatorWithOnMultipleCondition();
    await d3.isValid(["context_a", "context_b"]);
    expect(d3.history).toEqual([
      "before_validation_marker on context_a",
      "before_validation_marker on context_b",
      "after_validation_marker on context_a",
      "after_validation_marker on context_b",
    ]);
  });

  it("on multiple condition is respected for validation without matching context", async () => {
    const d = new DogValidatorWithOnMultipleCondition();
    await d.isValid("save");
    expect(d.history).toEqual([]);
  });

  it("on multiple condition is respected for validation without context", async () => {
    const d = new DogValidatorWithOnMultipleCondition();
    await d.isValid();
    expect(d.history).toEqual([]);
  });

  it("further callbacks should be called if before validation returns false", async () => {
    const log: string[] = [];
    class Person extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
        this.attribute("name", "string");
        this.afterValidation(() => {
          log.push("after");
        });
      }
    }
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    await p.isValid();
    expect(log).toContain("after");
  });

  it("further callbacks should be called if after validation returns false", async () => {
    const log: string[] = [];
    class Person extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
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
    interface Person extends Attributes {}

    const p = new Person({ name: "test" });
    await p.isValid();
    expect(log).toContain("first");
  });

  it("before validation does not mutate the if options array", () => {
    const opts: Array<(r: any) => boolean> = [];
    class CreateDog extends Dog {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      static {
        include(this, ValidationsCallbacks);
        this.beforeValidation(() => {}, { if: opts, on: "create" });
      }
    }
    void CreateDog;
    expect(opts).toEqual([]);
  });

  it("after validation does not mutate the if options array", () => {
    const opts: Array<(r: any) => boolean> = [];
    class CreateDog extends Dog {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      static {
        include(this, ValidationsCallbacks);
        this.afterValidation(() => {}, { if: opts, on: "create" });
      }
    }
    void CreateDog;
    expect(opts).toEqual([]);
  });

  it("before validation and after validation callbacks should be called with proc", async () => {
    const log: string[] = [];
    class Person extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
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
    interface Person extends Attributes {}

    const p = new Person({ name: "Alice" });
    await p.isValid();
    expect(log).toContain("before_proc");
    expect(log).toContain("after_proc");
  });

  it("if condition is respected for before validation", async () => {
    const log: string[] = [];
    class Person extends Model {
      declare static beforeValidation: (typeof ValidationsCallbacks.ClassMethods)["beforeValidation"];
      declare static afterValidation: (typeof ValidationsCallbacks.ClassMethods)["afterValidation"];
      declare static attribute: AttributesClassHalf["attribute"];

      static {
        include(this, ValidationsCallbacks);
        include(this, Attributes);
        this.attribute("name", "string");
        this.beforeValidation(
          (_r: any) => {
            log.push("before");
          },
          { if: (r: any) => r._readAttribute("name") === "trigger" },
        );
      }
    }
    interface Person extends Attributes {}

    const p1 = new Person({ name: "Alice" });
    await p1.isValid();
    expect(log).toEqual([]);

    const p2 = new Person({ name: "trigger" });
    await p2.isValid();
    expect(log).toEqual(["before"]);
  });

  it("on condition is respected for validation with matching context", async () => {
    const d = new DogValidatorWithOnCondition();
    await d.isValid("create");
    expect(d.history).toEqual(["before_validation_marker", "after_validation_marker"]);
  });
});
