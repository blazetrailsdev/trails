import { describe, it } from "vitest";
import { isAnonymous } from "../../../lib/module-ext.js";
import { assertNotPredicate, assertPredicate } from "../../../lib/testing/assertions.js";

describe("AnonymousTest", () => {
  it("an anonymous class or module are anonymous", () => {
    assertPredicate((() => function () {})(), isAnonymous);
    assertPredicate((() => class {})(), isAnonymous);
  });

  it("a named class or module are not anonymous", () => {
    assertNotPredicate(Function, isAnonymous);
    assertNotPredicate(Object, isAnonymous);
  });
});
