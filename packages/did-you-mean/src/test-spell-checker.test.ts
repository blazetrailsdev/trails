// Port of vendor/did_you_mean/test/test_spell_checker.rb.
// Test names mirror the Ruby file so parity:test matches.
import { describe, it, expect } from "vitest";

import { SpellChecker } from "./spell-checker.js";

// minitest's `assert_empty`. did-you-mean has no dependencies, so the shared
// activesupport testing/assertions surface is not reachable from here.
function assertEmpty(actual: unknown[]): void {
  expect(actual).toHaveLength(0);
}

function assertSpell(expected: string | string[], input: string, dictionary: string[]): void {
  const corrections = new SpellChecker({ dictionary }).correct(input);
  expect(corrections).toEqual(Array.isArray(expected) ? expected : [expected]);
}

describe("SpellCheckerTest", () => {
  it("spell checker corrects mistypes", () => {
    assertSpell("foo", "doo", ["foo", "fork"]);
    assertSpell("email", "meail", ["email", "fail", "eval"]);
    assertSpell("fail", "fial", ["email", "fail", "eval"]);
    assertSpell("fail", "afil", ["email", "fail", "eval"]);
    assertSpell("eval", "eavl", ["email", "fail", "eval"]);
    assertSpell("eval", "veal", ["email", "fail", "eval"]);
    assertSpell("sub!", "suv!", ["sub", "gsub", "sub!"]);
    assertSpell("sub", "suv", ["sub", "gsub", "sub!"]);
    assertSpell("Foo", "FOo", ["Foo", "FOo"]);

    assertSpell(["gsub!", "gsub"], "gsuv!", ["sub", "gsub", "gsub!"]);
    assertSpell(["sub!", "sub", "gsub!"], "ssub!", ["sub", "sub!", "gsub", "gsub!"]);

    const groupMethods = ["groups", "group_url", "groups_url", "group_path"];
    assertSpell("groups", "group", groupMethods);

    const groupClasses = [
      "GroupMembership",
      "GroupMembershipPolicy",
      "GroupMembershipDecorator",
      "GroupMembershipSerializer",
      "GroupHelper",
      "Group",
      "GroupMailer",
      "NullGroupMembership",
    ];
    assertSpell("GroupMembership", "GroupMemberhip", groupClasses);
    assertSpell("GroupMembershipDecorator", "GroupMemberhipDecorator", groupClasses);

    const names = ["first_name_change", "first_name_changed?", "first_name_will_change!"];
    assertSpell(names, "first_name_change!", names);

    assertEmpty(new SpellChecker({ dictionary: ["proc"] }).correct("product_path"));
    assertEmpty(new SpellChecker({ dictionary: ["fork"] }).correct("fooo"));
  });

  it("spell checker corrects misspells", () => {
    assertSpell("descendants", "dependents", ["descendants"]);
    assertSpell("drag_to", "drag", ["drag_to"]);
    assertSpell("set_result_count", "set_result", ["set_result_count"]);
  });

  it("spell checker sorts results by simiarity", () => {
    const actual = new SpellChecker({
      dictionary: ["name12", "name123", "name1234", "name12345", "name123456"],
    }).correct("name123456");
    expect(actual).toEqual(["name12345", "name1234", "name123"]);
  });

  it("spell checker excludes input from dictionary", () => {
    assertEmpty(new SpellChecker({ dictionary: ["input"] }).correct("input"));
    // The gem's second and third arms pass `:input` as the dictionary entry and
    // as the input; a Ruby Symbol is a JS string, so both are the first arm here.
    assertEmpty(new SpellChecker({ dictionary: ["input"] }).correct("input"));
    assertEmpty(new SpellChecker({ dictionary: ["input"] }).correct("input"));
  });
});
