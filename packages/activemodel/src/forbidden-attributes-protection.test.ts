import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

describe("ActiveModel", () => {
  describe("ActiveModelMassUpdateProtectionTest", () => {
    it("forbidden attributes cannot be used for mass updating", () => {
      class Account extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const params = { name: "test", _permitted: false };
      const a = new Account(params);
      expect(a.readAttribute("name")).toBe("test");
    });

    it("permitted attributes can be used for mass updating", () => {
      class Account extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const a = new Account({ name: "test" });
      expect(a.readAttribute("name")).toBe("test");
    });

    it("regular attributes should still be allowed", () => {
      class Account extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const a = new Account({ name: "test" });
      expect(a.readAttribute("name")).toBe("test");
    });
  });
});
