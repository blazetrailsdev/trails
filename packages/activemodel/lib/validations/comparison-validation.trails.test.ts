/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type --
   The model below spells `include ActiveModel::Attributes` in its class body, the way the Rails
   test model it mirrors does (attributes_test.rb:6-8); the empty class/interface merge beside it is
   how `include()` surfaces those members on the type side. */
import { describe, it, expect, afterEach } from "vitest";
import { include } from "@blazetrails/activesupport";
import { Model } from "../index.js";
import { Attributes, type AttributesClassHalf } from "../attributes.js";
import { ValueType } from "../type/value.js";

class Topic extends Model {
  declare approved: any;
  declare static attribute: AttributesClassHalf["attribute"];

  static {
    include(this, Attributes);
    this.attribute("approved", new ValueType());
  }
}
interface Topic extends Attributes {}

describe("ComparisonValidator — trails-only coverage", () => {
  afterEach(() => {
    Topic.clearValidatorsBang();
  });

  it("takes the :blank arm for any blank receiver, not only a String (comparison.rb:29)", async () => {
    Topic.validatesComparisonOf("approved", { greaterThan: 10 });

    const t = new Topic();
    t.approved = [];
    expect(await t.isValid()).toBe(false);
    expect(t.errors.messagesFor("approved")).toEqual(["can't be blank"]);
  });
});
