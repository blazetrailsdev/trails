import { beforeEach, describe, expect, it } from "vitest";
import { Deprecation } from "../deprecation.js";
import { assertDeprecated, assertNotDeprecated } from "../testing/deprecation.js";
import { assert } from "../testing/assertions.js";

describe("MethodWrappersTest", () => {
  let klass: any;
  let deprecator: Deprecation;

  beforeEach(() => {
    klass = class {
      newMethod() {
        return "abc";
      }

      protected newProtectedMethod() {
        return "abc";
      }

      private newPrivateMethod() {
        return "abc";
      }
    };
    klass.prototype.oldMethod = klass.prototype.newMethod;
    klass.prototype.oldProtectedMethod = klass.prototype.newProtectedMethod;
    klass.prototype.oldPrivateMethod = klass.prototype.newPrivateMethod;

    deprecator = new Deprecation();
  });

  it("deprecate methods without alternate method", async () => {
    deprecator.deprecateMethods(klass.prototype, "oldMethod");

    await assertDeprecated("oldMethod", deprecator, () => {
      expect(new klass().oldMethod()).toEqual(new klass().newMethod());
    });
  });

  it("deprecate methods warning default", async () => {
    deprecator.deprecateMethods(klass.prototype, { oldMethod: ":newMethod" });

    await assertDeprecated(/oldMethod .* \(use newMethod instead\)/, deprecator, () => {
      expect(new klass().oldMethod()).toEqual(new klass().newMethod());
    });
  });

  it("deprecate methods warning with optional deprecator", async () => {
    deprecator = new Deprecation("next-release", "MyGem");
    const otherDeprecator = new Deprecation();
    otherDeprecator.deprecateMethods(klass.prototype, "oldMethod", { deprecator });

    await assertDeprecated(/oldMethod .* MyGem next-release/, deprecator, async () => {
      await assertNotDeprecated(otherDeprecator, () => {
        expect(new klass().oldMethod()).toEqual(new klass().newMethod());
      });
    });
  });

  it("deprecate methods protected method", () => {
    deprecator.deprecateMethods(klass.prototype, { oldProtectedMethod: ":newProtectedMethod" });

    assert("oldProtectedMethod" in klass.prototype);
  });

  it("deprecate methods private method", () => {
    deprecator.deprecateMethods(klass.prototype, { oldPrivateMethod: ":newPrivateMethod" });

    assert("oldPrivateMethod" in klass.prototype);
  });

  it("deprecate class method", async () => {
    const mod = {
      oldMethod() {
        return "abc";
      },
    };
    deprecator.deprecateMethods(mod, "oldMethod");

    await assertDeprecated("oldMethod", deprecator, () => {
      expect(mod.oldMethod()).toEqual("abc");
    });
  });

  it("deprecate method when class extends module", async () => {
    const mod = {
      oldMethod() {
        return "abc";
      },
    };
    const klass = class {};
    Object.setPrototypeOf(klass, mod);
    deprecator.deprecateMethods(mod, "oldMethod");

    await assertDeprecated("oldMethod", deprecator, () => {
      expect((klass as any).oldMethod()).toEqual("abc");
    });
  });
});
