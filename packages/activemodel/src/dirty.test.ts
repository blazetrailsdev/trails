import { describe, it, expect, beforeEach } from "vitest";
import {
  asJson as objectAsJson,
  extend,
  include,
  prepend,
  InstanceVariablesObject,
  ToJsonWithActiveSupportEncoder,
  type Included,
} from "@blazetrails/activesupport";
import * as AttributeMethods from "./attribute-methods.js";
import { Dirty, asJson as dirtyAsJson, initInternals as dirtyInitInternals } from "./dirty.js";

/**
 * Rails' `DirtyTest::DirtyModel` (dirty_test.rb:6-43) includes
 * `ActiveModel::API` + `ActiveModel::Dirty` and nothing else — no
 * `ActiveModel::Attributes`. Having no `@attributes`, it takes the second arm
 * of `mutations_from_database` (dirty.rb:382-388) and tracks through
 * `ActiveModel::ForcedMutationTracker`, which is what this file exercises.
 *
 * Ruby's `@name` + `attr_reader :name` + a hand-written `name=` port to one
 * own, enumerable accessor property per ivar: `Object#as_json` serializes an
 * object through `instance_values` (core_ext/object/json.rb:58-66), i.e. its
 * own properties, so the ivar has to be spelled with the reader's name — and a
 * data property of that name would shadow the writer the Ruby model defines.
 * The values live in `#ivars`, which no `instance_values` can see.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (dirty_test.rb:7-8); the class/interface merge is how `include()` surfaces on the type side.
class DirtyModel {
  #ivars: Record<string, unknown> = {};

  constructor() {
    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      get: () => this.#ivars["name"],
      set: (val: unknown) => {
        this.nameWillChange();
        this.#ivars["name"] = val;
      },
    });
    Object.defineProperty(this, "color", {
      enumerable: true,
      configurable: true,
      get: () => this.#ivars["color"],
      set: (val: unknown) => {
        if (val !== this.#ivars["color"]) this.colorWillChange();
        this.#ivars["color"] = val;
      },
    });
    Object.defineProperty(this, "size", {
      enumerable: true,
      configurable: true,
      get: () => this.#ivars["size"],
      set: (val: unknown) => {
        if (val !== this.#ivars["size"]) this.attributeWillChangeBang("size");
        this.#ivars["size"] = val;
      },
    });
    Object.defineProperty(this, "status", {
      enumerable: true,
      configurable: true,
      get: () => this.#ivars["status"],
      set: (val: unknown) => {
        if (val !== this.#ivars["status"]) this.statusWillChange();
        this.#ivars["status"] = val;
      },
    });

    this.#ivars["name"] = null;
    this.#ivars["color"] = null;
    this.#ivars["size"] = null;
    this.#ivars["status"] = "initialized";
  }

  save(): void {
    this.changesApplied();
  }

  /**
   * `Object#as_json` (core_ext/object/json.rb:58-66), which Ruby's DirtyModel
   * inherits from `Object` and TypeScript cannot: `Object` is not reopenable,
   * so the body is spelled at the class Ruby gets it from.
   */
  asJson(options?: Record<string, unknown>): unknown {
    return objectAsJson(InstanceVariablesObject.instanceValues(this), options);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface DirtyModel extends Dirty {
  name: unknown;
  color: unknown;
  size: unknown;
  status: unknown;

  nameWillChange(): void;
  colorWillChange(): void;
  statusWillChange(): void;
  isNameChanged(...args: unknown[]): boolean;
  isColorChanged(): boolean;
  isSizeChanged(): boolean;
  isStatusChanged(): boolean;
  nameChanged(options?: { from?: unknown; to?: unknown }): boolean;
  colorChanged(): boolean;
  sizeChanged(): boolean;
  statusChanged(): boolean;
  namePreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean;
  nameChange: [unknown, unknown] | null;
  statusChange: [unknown, unknown] | null;
  namePreviousChange: [unknown, unknown] | null;
  nameWas: unknown;
  restoreName(): void;
  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];
}

// `include ActiveModel::AttributeMethods`, which `define_attribute_methods`
// and every `*_will_change!` come from (attribute_methods.rb:73).
extend(DirtyModel, {
  attributeMethodPrefix: AttributeMethods.attributeMethodPrefix,
  attributeMethodSuffix: AttributeMethods.attributeMethodSuffix,
  attributeMethodAffix: AttributeMethods.attributeMethodAffix,
  aliasAttribute: AttributeMethods.aliasAttribute,
  defineAttributeMethods: AttributeMethods.defineAttributeMethods,
  defineAttributeMethod: AttributeMethods.defineAttributeMethod,
  defineAttributeMethodPattern: AttributeMethods.defineAttributeMethodPattern,
  undefineAttributeMethods: AttributeMethods.undefineAttributeMethods,
  resolveAttributeName: AttributeMethods.resolveAttributeName,
  generatedAttributeMethods: AttributeMethods.generatedAttributeMethods,
  isInstanceMethodAlreadyImplemented: AttributeMethods.isInstanceMethodAlreadyImplemented,
  attributeMethodPatternsCache: AttributeMethods.attributeMethodPatternsCache,
  attributeMethodPatternsMatching: AttributeMethods.attributeMethodPatternsMatching,
});
include(DirtyModel, AttributeMethods.InstanceMethods);

// `include ActiveModel::Dirty` (dirty_test.rb:8) and its `included do` block
// (dirty.rb:241-245).
include(DirtyModel, Dirty);
const DirtyModelClass = DirtyModel as unknown as {
  attributeMethodSuffix(...args: unknown[]): void;
  attributeMethodAffix(affix: Record<string, unknown>): void;
  defineAttributeMethods(...attrNames: string[]): void;
};
DirtyModelClass.attributeMethodSuffix("PreviouslyChanged", "Changed", { parameters: "**options" });
DirtyModelClass.attributeMethodSuffix("Change", "WillChange!", "Was", { parameters: false });
DirtyModelClass.attributeMethodSuffix("PreviousChange", "PreviouslyWas", { parameters: false });
DirtyModelClass.attributeMethodAffix({ prefix: "restore", suffix: "!", parameters: false });
DirtyModelClass.attributeMethodAffix({ prefix: "clear", suffix: "Change", parameters: false });
// `ActiveSupport::ToJsonWithActiveSupportEncoder` is included into `Object`
// (core_ext/object/json.rb:47-49), which TypeScript cannot reopen either.
include(DirtyModel, ToJsonWithActiveSupportEncoder);

prepend(DirtyModel.prototype, {
  initInternals: dirtyInitInternals,
  asJson: dirtyAsJson,
});

// dirty_test.rb:9
DirtyModelClass.defineAttributeMethods("name", "color", "size", "status");

describe("DirtyTest", () => {
  let model: DirtyModel;

  beforeEach(() => {
    model = new DirtyModel();
  });

  it("setting attribute will result in change", () => {
    expect(model.isChanged).toBe(false);
    expect(model.nameChanged()).toBe(false);
    model.name = "Ringo";
    expect(model.isChanged).toBe(true);
    expect(model.nameChanged()).toBe(true);
  });

  it("list of changed attribute keys", () => {
    expect(model.changed).toEqual([]);
    model.name = "Paul";
    expect(model.changed).toEqual(["name"]);
  });

  it("changes to attribute values", () => {
    expect(model.changes["name"]).toBeUndefined();
    model.name = "John";
    expect(model.changes["name"]).toEqual([null, "John"]);
  });

  it("checking if an attribute has changed to a particular value", () => {
    model.name = "Ringo";
    expect(model.nameChanged({ from: null, to: "Ringo" })).toBe(true);
    expect(model.nameChanged({ from: "Pete", to: "Ringo" })).toBe(false);
    expect(model.nameChanged({ to: "Ringo" })).toBe(true);
    expect(model.nameChanged({ to: "Pete" })).toBe(false);
    expect(model.nameChanged({ from: null })).toBe(true);
    expect(model.nameChanged({ from: "Pete" })).toBe(false);
  });

  it("changes accessible through both strings and symbols", () => {
    model.name = "David";
    expect(model.changes["name"]).not.toBeNull();
  });

  it("be consistent with symbols arguments after the changes are applied", () => {
    model.name = "David";
    expect(model.attributeChanged("name")).toBe(true);
    model.save();
    model.name = "Rafael";
    expect(model.attributeChanged("name")).toBe(true);
  });

  it("attribute mutation", () => {
    // Rails sets `@name` behind the writer, mutates the String in place, and
    // asserts neither shows as a change — `ForcedMutationTracker#changed_in_place?`
    // is a flat `false` (attribute_mutation_tracker.rb:95-97). JS strings have
    // no in-place mutation, so the ivar write stands in for both steps.
    // Ruby's `instance_variable_set("@name", …)` writes past the writer; the
    // JS analogue replaces the accessor with the value it would have read.
    Object.defineProperty(model, "name", { value: "Yam", enumerable: true, configurable: true });
    expect(model.nameChanged()).toBe(false);
    model.nameWillChange();
    expect(model.nameChanged()).toBe(true);
  });

  it("resetting attribute", () => {
    model.name = "Bob";
    model.restoreName();
    expect(model.name).toBeNull();
    expect(model.nameChanged()).toBe(false);
  });

  it("setting color to same value should not result in change being recorded", () => {
    model.color = "red";
    expect(model.colorChanged()).toBe(true);
    model.save();
    expect(model.colorChanged()).toBe(false);
    expect(model.isChanged).toBe(false);
    model.color = "red";
    expect(model.colorChanged()).toBe(false);
    expect(model.isChanged).toBe(false);
  });

  it("saving should reset model's changed status", () => {
    model.name = "Alf";
    expect(model.isChanged).toBe(true);
    model.save();
    expect(model.isChanged).toBe(false);
    expect(model.nameChanged()).toBe(false);
  });

  it("saving should preserve previous changes", () => {
    model.name = "Jericho Cane";
    model.status = "waiting";
    model.save();
    expect(model.previousChanges["name"]).toEqual([null, "Jericho Cane"]);
    expect(model.previousChanges["status"]).toEqual(["initialized", "waiting"]);
  });

  it("setting new attributes should not affect previous changes", () => {
    model.name = "Jericho Cane";
    model.status = "waiting";
    model.save();
    model.name = "DudeFella ManGuy";
    model.status = "finished";
    expect(model.namePreviousChange).toEqual([null, "Jericho Cane"]);
    expect(model.previousChanges["status"]).toEqual(["initialized", "waiting"]);
  });

  it("saving should preserve model's previous changed status", () => {
    model.name = "Jericho Cane";
    model.save();
    expect(model.namePreviouslyChanged()).toBe(true);
  });

  it("checking if an attribute was previously changed to a particular value", () => {
    model.name = "Ringo";
    model.save();
    expect(model.namePreviouslyChanged({ from: null, to: "Ringo" })).toBe(true);
    expect(model.namePreviouslyChanged({ from: "Pete", to: "Ringo" })).toBe(false);
    expect(model.namePreviouslyChanged({ to: "Ringo" })).toBe(true);
    expect(model.namePreviouslyChanged({ to: "Pete" })).toBe(false);
    expect(model.namePreviouslyChanged({ from: null })).toBe(true);
    expect(model.namePreviouslyChanged({ from: "Pete" })).toBe(false);
  });

  it("previous value is preserved when changed after save", () => {
    expect(model.changedAttributes).toEqual({});
    model.name = "Paul";
    model.status = "waiting";
    expect(model.changedAttributes).toEqual({ name: null, status: "initialized" });

    model.save();

    model.name = "John";
    model.status = "finished";
    expect(model.changedAttributes).toEqual({ name: "Paul", status: "waiting" });
  });

  it("changing the same attribute multiple times retains the correct original value", () => {
    model.name = "Otto";
    model.status = "waiting";
    model.save();
    model.name = "DudeFella ManGuy";
    model.name = "Mr. Manfredgensonton";
    model.status = "processing";
    model.status = "finished";
    expect(model.nameChange).toEqual(["Otto", "Mr. Manfredgensonton"]);
    expect(model.statusChange).toEqual(["waiting", "finished"]);
    expect(model.nameWas).toBe("Otto");
  });

  it("using attribute_will_change! with a symbol", () => {
    model.size = 1;
    expect(model.sizeChanged()).toBe(true);
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

    expect(model.isChanged).toBe(false);
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

    expect(model.isChanged).toBe(true);
    expect(model.name).toBe("Dmitry");
    expect(model.color).toBe("White");
  });

  it("model can be dup-ed without Attributes", () => {
    expect(model).toBeTruthy();
  });

  it("to_json should work on model", () => {
    model.name = "Dmitry";
    expect(model.toJSON()).toBe(
      '{"name":"Dmitry","color":null,"size":null,"status":"initialized"}',
    );
  });

  it("to_json should work on model with :except string option", () => {
    model.name = "Dmitry";
    expect(model.toJSON({ except: "name" })).toBe(
      '{"color":null,"size":null,"status":"initialized"}',
    );
  });

  it("to_json should work on model with :except array option", () => {
    model.name = "Dmitry";
    expect(model.toJSON({ except: ["name"] })).toBe(
      '{"color":null,"size":null,"status":"initialized"}',
    );
  });

  it("to_json should work on model after save", () => {
    model.name = "Dmitry";
    model.save();
    expect(model.toJSON()).toBe(
      '{"name":"Dmitry","color":null,"size":null,"status":"initialized"}',
    );
  });
});
