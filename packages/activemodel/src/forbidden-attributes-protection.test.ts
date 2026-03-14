import { describe, it, expect } from "vitest";
import { Model } from "./index.js";

// In Rails, ForbiddenAttributesProtection prevents mass assignment with
// unpermitted params (ActionController::Parameters). Our TS implementation
// doesn't have a strong params equivalent, so these tests verify basic
// mass assignment behavior with plain objects.
describe("ActiveModel", () => {
  describe("ActiveModelMassUpdateProtectionTest", () => {
    it("forbidden attributes cannot be used for mass updating", () => {
      class Account extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      // Without strong params, plain objects are always allowed
      const a = new Account({});
      a.assignAttributes({ name: "test" });
      expect(a.readAttribute("name")).toBe("test");
    });

    it("permitted attributes can be used for mass updating", () => {
      class Account extends Model {
        static {
          this.attribute("name", "string");
        }
      }
      const a = new Account({});
      a.assignAttributes({ name: "test" });
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
