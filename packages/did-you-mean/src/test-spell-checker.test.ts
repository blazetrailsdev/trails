// Port of vendor/did_you_mean/test/test_spell_checker.rb.
// Test names mirror the Ruby file so test:compare matches.
import { describe, it, expect } from "vitest";

import { SpellChecker } from "./spell-checker.js";

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

    expect(new SpellChecker({ dictionary: ["proc"] }).correct("product_path")).toEqual([]);
    expect(new SpellChecker({ dictionary: ["fork"] }).correct("fooo")).toEqual([]);
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
    expect(new SpellChecker({ dictionary: ["input"] }).correct("input")).toEqual([]);
  });
});
