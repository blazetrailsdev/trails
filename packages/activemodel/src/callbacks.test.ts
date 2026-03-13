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
});
