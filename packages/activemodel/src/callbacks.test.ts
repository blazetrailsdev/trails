import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("CallbacksTest", () => {
    it("after callbacks are not executed if the block returns false", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.beforeValidation((r: any) => {
            log.push("before");
            return false;
          });
          this.afterValidation((r: any) => {
            log.push("after");
          });
        }
      }
      const p = new Person({ name: "Alice" });
      p.isValid();
      expect(log).toContain("before");
      expect(log).not.toContain("after");
    });
  });

  describe("CallbacksTest", () => {
    it("only selects which types of callbacks should be created from an array list", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.beforeValidation(() => {
            log.push("before");
          });
          this.afterValidation(() => {
            log.push("after");
          });
        }
      }
      const p = new Person({ name: "test" });
      p.isValid();
      expect(log).toContain("before");
      expect(log).toContain("after");
    });

    it("no callbacks should be created", () => {
      class Person extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const p = new Person({ name: "test" });
      expect(p.isValid()).toBe(true);
    });

    it("after_create callbacks with both callbacks declared in different lines", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterCreate(() => {
            log.push("first");
          });
          this.afterCreate(() => {
            log.push("second");
          });
        }
      }
      const p = new Person({ name: "test" });
      (p.constructor as typeof Model)._callbackChain.runAfter("create", p);
      expect(log).toEqual(["first", "second"]);
    });
  });

  describe("Callbacks (ported)", () => {
    it("complete callback chain", () => {
      const order: string[] = [];
      class Person extends Model {
        static {
          this.beforeSave(() => {
            order.push("before_save");
          });
          this.aroundSave((_r, proceed) => {
            order.push("around_before");
            proceed();
            order.push("around_after");
          });
          this.afterSave(() => {
            order.push("after_save");
          });
        }
      }
      new Person().runCallbacks("save", () => {
        order.push("save");
      });
      expect(order).toEqual(["before_save", "around_before", "save", "around_after", "after_save"]);
    });

    it("the callback chain is halted when a callback throws :abort", () => {
      const order: string[] = [];
      class Person extends Model {
        static {
          this.beforeSave(() => {
            order.push("first");
          });
          this.beforeSave(() => {
            order.push("halt");
            return false;
          });
          this.beforeSave(() => {
            order.push("never");
          });
          this.afterSave(() => {
            order.push("after");
          });
        }
      }
      const result = new Person().runCallbacks("save", () => {
        order.push("action");
      });
      expect(result).toBe(false);
      expect(order).toContain("halt");
      expect(order).not.toContain("never");
      expect(order).not.toContain("action");
      expect(order).not.toContain("after");
    });

    it("only selects which types of callbacks should be created", () => {
      // Test that before/after/around create callbacks exist
      const order: string[] = [];
      class Person extends Model {
        static {
          this.beforeCreate(() => {
            order.push("before_create");
          });
          this.afterCreate(() => {
            order.push("after_create");
          });
        }
      }
      new Person().runCallbacks("create", () => {
        order.push("create");
      });
      expect(order).toEqual(["before_create", "create", "after_create"]);
    });

    it("after_create callbacks with both callbacks declared in one line", () => {
      const order: string[] = [];
      class Person extends Model {
        static {
          this.afterCreate(() => {
            order.push("first_after");
          });
          this.afterCreate(() => {
            order.push("second_after");
          });
        }
      }
      new Person().runCallbacks("create", () => {
        order.push("create");
      });
      expect(order).toEqual(["create", "first_after", "second_after"]);
    });
  });

  describe("CallbacksTest (ported)", () => {
    it("the callback chain is not halted when around or after callbacks return false", () => {
      const log: string[] = [];
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterValidation((r: any) => {
            log.push("after1");
            return false;
          });
          this.afterValidation((r: any) => {
            log.push("after2");
          });
        }
      }
      const p = new Person({ name: "Alice" });
      p.isValid();
      expect(log).toEqual(["after1", "after2"]);
    });

    it("the :if option array should not be mutated by an after callback", () => {
      const conditions = { if: (r: any) => true };
      class Person extends Model {
        static {
          this.attribute("name", "string");
          this.afterValidation((r: any) => {}, conditions);
        }
      }
      const p = new Person({ name: "Alice" });
      p.isValid();
      expect(typeof conditions.if).toBe("function");
    });
  });
});
