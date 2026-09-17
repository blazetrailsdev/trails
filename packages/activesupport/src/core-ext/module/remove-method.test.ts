import { beforeEach, describe, expect, it } from "vitest";
import { removePossibleMethod, removePossibleSingletonMethod } from "./remove-method.js";
import { assert, assertNotRespondTo } from "../../testing/assertions.js";

describe("RemoveMethodTest", () => {
  let A: any;

  beforeEach(() => {
    A = class {
      doSomething() {
        return 1;
      }

      protected doSomethingProtected() {
        return 1;
      }

      private doSomethingPrivate() {
        return 1;
      }

      static doSomethingElse() {
        return 2;
      }
    };
  });

  it("remove method from an object", () => {
    removePossibleMethod.call(A, "doSomething");
    assertNotRespondTo(new A(), "doSomething");
  });

  it("remove singleton method from an object", () => {
    removePossibleSingletonMethod.call(A, "doSomethingElse");
    assertNotRespondTo(A, "doSomethingElse");
  });

  it("redefine method in an object", () => {
    A.prototype.doSomething = () => 100;
    A.prototype.doSomethingProtected = () => 100;
    A.prototype.doSomethingPrivate = () => 100;
    expect(new A().doSomething()).toEqual(100);
    expect(new A().doSomethingProtected()).toEqual(100);
    expect(new A().doSomethingPrivate()).toEqual(100);

    assert("doSomething" in A.prototype);
    assert("doSomethingProtected" in A.prototype);
    assert("doSomethingPrivate" in A.prototype);
  });
});
