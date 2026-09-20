/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging --
   Each model below spells `include ActiveModel::Dirty` in its class body, the way the Rails test
   model it mirrors does; the empty class/interface merge beside it is how `include()` surfaces
   those members on the type side. */
import { describe, it, expect, beforeEach } from "vitest";
import {
  assert,
  assertNot,
  assertPredicate,
  assertNotPredicate,
  include,
} from "@blazetrails/activesupport";
import { Dirty } from "./dirty.js";
import { Model } from "./index.js";
import { Attributes, type AttributesClassHalf } from "./attributes.js";

describe("AttributesDirtyTest", () => {
  class DirtyModel extends Model {
    declare static attribute: AttributesClassHalf["attribute"];

    static {
      include(this, Attributes);
      include(this, Dirty);
      this.attribute("name", "string");
      this.attribute("color", "string");
      this.attribute("size", "integer");
    }

    save(): void {
      this.changesApplied();
    }
  }
  interface DirtyModel extends Attributes, Dirty {
    name: string;
    color: string;
    size: number;

    nameChanged(options?: { from?: unknown; to?: unknown }): boolean;
    colorChanged(): boolean;
    sizeChanged(): boolean;
    namePreviouslyChanged(): boolean;
    nameChange: [unknown, unknown] | null;
    namePreviousChange: [unknown, unknown] | null;
    nameWas: unknown;
    restoreName(): void;
  }

  let model: DirtyModel;

  beforeEach(() => {
    model = new DirtyModel();
  });

  it("setting attribute will result in change", () => {
    assertNotPredicate(model, (m) => m.isChanged);
    assertNotPredicate(model, (m) => m.nameChanged());
    model.name = "Ringo";
    assertPredicate(model, (m) => m.isChanged);
    assertPredicate(model, (m) => m.nameChanged());
  });

  it("list of changed attribute keys", () => {
    expect(model.changed).toEqual([]);
    model.name = "Paul";
    expect(model.changed).toEqual(["name"]);
  });

  it("changes to attribute values", () => {
    assertNot(model.changes["name"]);
    model.name = "John";
    expect(model.changes["name"]).toEqual([null, "John"]);
  });

  it("checking if an attribute has changed to a particular value", () => {
    model.name = "Ringo";
    assert(model.nameChanged({ from: null, to: "Ringo" }));
    assertNot(model.nameChanged({ from: "Pete", to: "Ringo" }));
    assert(model.nameChanged({ to: "Ringo" }));
    assertNot(model.nameChanged({ to: "Pete" }));
    assert(model.nameChanged({ from: null }));
    assertNot(model.nameChanged({ from: "Pete" }));
  });

  it("changes accessible through both strings and symbols", () => {
    model.name = "David";
    expect(model.changes["name"]).not.toBeNull();
    expect(model.changes["name"]).not.toBeNull();
  });

  it("be consistent with symbols arguments after the changes are applied", () => {
    model.name = "David";
    assert(model.attributeChanged("name"));
    model.save();
    model.name = "Rafael";
    assert(model.attributeChanged("name"));
  });

  // BLOCKED: attributes-dirty-attribute-mutation-needs-in-place-string-mutation
  it.skip("attribute mutation", () => {
    model.name = "Yam";
    model.save();
    assertNotPredicate(model, (m) => m.nameChanged());
    (model.name as unknown as { replace(other: string): void }).replace("Hadad");
    assertPredicate(model, (m) => m.nameChanged());
  });

  it("resetting attribute", () => {
    model.name = "Bob";
    model.restoreName();
    expect(model.name).toBeNull();
    assertNotPredicate(model, (m) => m.nameChanged());
  });

  it("setting color to same value should not result in change being recorded", () => {
    model.color = "red";
    assertPredicate(model, (m) => m.colorChanged());
    model.save();
    assertNotPredicate(model, (m) => m.colorChanged());
    assertNotPredicate(model, (m) => m.isChanged);
    model.color = "red";
    assertNotPredicate(model, (m) => m.colorChanged());
    assertNotPredicate(model, (m) => m.isChanged);
  });

  it("saving should reset model's changed status", () => {
    model.name = "Alf";
    assertPredicate(model, (m) => m.isChanged);
    model.save();
    assertNotPredicate(model, (m) => m.isChanged);
    assertNotPredicate(model, (m) => m.nameChanged());
  });

  it("saving should preserve previous changes", () => {
    model.name = "Jericho Cane";
    model.save();
    expect(model.previousChanges["name"]).toEqual([null, "Jericho Cane"]);
  });

  it("setting new attributes should not affect previous changes", () => {
    model.name = "Jericho Cane";
    model.save();
    model.name = "DudeFella ManGuy";
    expect(model.namePreviousChange).toEqual([null, "Jericho Cane"]);
  });

  it("saving should preserve model's previous changed status", () => {
    model.name = "Jericho Cane";
    model.save();
    assertPredicate(model, (m) => m.namePreviouslyChanged());
  });

  it("previous value is preserved when changed after save", () => {
    expect(model.changedAttributes).toEqual({});
    model.name = "Paul";
    expect(model.changedAttributes).toEqual({ name: null });

    model.save();

    model.name = "John";
    expect(model.changedAttributes).toEqual({ name: "Paul" });
  });

  it("changing the same attribute multiple times retains the correct original value", () => {
    model.name = "Otto";
    model.save();
    model.name = "DudeFella ManGuy";
    model.name = "Mr. Manfredgensonton";
    expect(model.nameChange).toEqual(["Otto", "Mr. Manfredgensonton"]);
    expect(model.nameWas).toBe("Otto");
  });

  it("using attribute_will_change! with a symbol", () => {
    model.size = 1;
    assertPredicate(model, (m) => m.sizeChanged());
  });

  it("clear_changes_information should reset all changes", () => {
    model.name = "Dmitry";
    model.nameChanged();
    model.save();
    model.name = "Bob";

    expect(model.previousChanges["name"]).toEqual([null, "Dmitry"]);
    expect(model.changedAttributes["name"]).toBe("Dmitry");

    model.clearChangesInformation();

    expect(model.previousChanges).toEqual({});
    expect(model.changedAttributes).toEqual({});
  });

  it("restore_attributes should restore all previous data", () => {
    model.name = "Dmitry";
    model.color = "Red";
    model.save();
    model.name = "Bob";
    model.color = "White";

    model.restoreAttributes();

    assertNotPredicate(model, (m) => m.isChanged);
    expect(model.name).toBe("Dmitry");
    expect(model.color).toBe("Red");
  });

  it("restore_attributes can restore only some attributes", () => {
    model.name = "Dmitry";
    model.color = "Red";
    model.save();
    model.name = "Bob";
    model.color = "White";

    model.restoreAttributes(["name"]);

    assertPredicate(model, (m) => m.isChanged);
    expect(model.name).toBe("Dmitry");
    expect(model.color).toBe("White");
  });

  it("changing the attribute reports a change only when the cast value changes", () => {
    model.size = "2.3" as unknown as number;
    model.save();
    model.size = "2.1" as unknown as number;

    expect(model.isChanged).toBe(false);

    model.size = "5.1" as unknown as number;

    expect(model.isChanged).toBe(true);
    expect(model.sizeChanged()).toBe(true);
    expect(model.changes).toEqual({ size: [2, 5] });
  });
});
