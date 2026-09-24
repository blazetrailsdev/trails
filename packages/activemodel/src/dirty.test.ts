import { describe, it, expect, beforeEach } from "vitest";
import {
  assert,
  assertNil,
  assertNot,
  assertNotNil,
  assertPredicate,
  assertNotPredicate,
  asJson as objectAsJson,
  include,
  prepend,
  InstanceVariablesObject,
  ToJsonWithActiveSupportEncoder,
  type Included,
} from "@blazetrails/activesupport";
import * as AttributeMethods from "./attribute-methods.js";
import { Dirty, asJson as dirtyAsJson, initializeDup as dirtyInitializeDup } from "./dirty.js";
import { API } from "./api.js";

const ivars = Symbol("ivars");

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include` (dirty_test.rb:7-8); the class/interface merge is how `include()` surfaces on the type side.
class DirtyModel {
  constructor() {
    Object.defineProperty(this, ivars, { value: {}, writable: true, configurable: true });

    Object.defineProperty(this, "name", {
      enumerable: true,
      configurable: true,
      get(this: DirtyModel): unknown {
        return this[ivars]["name"];
      },
      set(this: DirtyModel, val: unknown) {
        this.nameWillChange();
        this[ivars]["name"] = val;
      },
    });
    Object.defineProperty(this, "color", {
      enumerable: true,
      configurable: true,
      get(this: DirtyModel): unknown {
        return this[ivars]["color"];
      },
      set(this: DirtyModel, val: unknown) {
        if (val !== this[ivars]["color"]) this.colorWillChange();
        this[ivars]["color"] = val;
      },
    });
    Object.defineProperty(this, "size", {
      enumerable: true,
      configurable: true,
      get(this: DirtyModel): unknown {
        return this[ivars]["size"];
      },
      set(this: DirtyModel, val: unknown) {
        if (val !== this[ivars]["size"]) this.attributeWillChangeBang("size");
        this[ivars]["size"] = val;
      },
    });
    Object.defineProperty(this, "status", {
      enumerable: true,
      configurable: true,
      get(this: DirtyModel): unknown {
        return this[ivars]["status"];
      },
      set(this: DirtyModel, val: unknown) {
        if (val !== this[ivars]["status"]) this.statusWillChange();
        this[ivars]["status"] = val;
      },
    });

    this[ivars]["name"] = null;
    this[ivars]["color"] = null;
    this[ivars]["size"] = null;
    this[ivars]["status"] = "initialized";
  }

  save(): void {
    this.changesApplied();
  }

  dup(): this {
    const duped = Object.create(Object.getPrototypeOf(this) as object) as this;
    const descriptors = Object.getOwnPropertyDescriptors(this);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key as string];
      descriptor.configurable = true;
      if (!descriptor.get && !descriptor.set) descriptor.writable = true;
    }
    Object.defineProperties(duped, descriptors);
    duped[ivars] = { ...this[ivars] };
    duped.initializeDup(this);
    return duped;
  }

  initializeDup(_other: this): void {}

  asJson(options?: Record<string, unknown>): unknown {
    return objectAsJson(InstanceVariablesObject.instanceValues(this), options);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface DirtyModel extends API, Dirty {
  [ivars]: Record<string, unknown>;
  name: unknown;
  color: unknown;
  size: unknown;
  status: unknown;

  nameWillChange(): void;
  colorWillChange(): void;
  statusWillChange(): void;
  nameChanged(options?: { from?: unknown; to?: unknown }): boolean;
  colorChanged(): boolean;
  sizeChanged(): boolean;
  namePreviouslyChanged(options?: { from?: unknown; to?: unknown }): boolean;
  nameChange: [unknown, unknown] | null;
  statusChange: [unknown, unknown] | null;
  namePreviousChange: [unknown, unknown] | null;
  nameWas: unknown;
  restoreName(): void;
  toJSON: Included<typeof ToJsonWithActiveSupportEncoder>["toJSON"];
}

include(DirtyModel, API);

include(DirtyModel, AttributeMethods.AttributeMethods);

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
include(DirtyModel, ToJsonWithActiveSupportEncoder);

prepend(DirtyModel.prototype, {
  asJson: dirtyAsJson,
  initializeDup: dirtyInitializeDup,
});

DirtyModelClass.defineAttributeMethods("name", "color", "size", "status");

describe("DirtyTest", () => {
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
    assertNotNil(model.changes["name"]);
    assertNotNil(model.changes["name"]);
  });

  it("be consistent with symbols arguments after the changes are applied", () => {
    model.name = "David";
    assert(model.attributeChanged("name"));
    model.save();
    model.name = "Rafael";
    assert(model.attributeChanged("name"));
  });

  it("attribute mutation", () => {
    Object.defineProperty(model, "name", { value: "Yam", enumerable: true, configurable: true });
    assertNotPredicate(model, (m) => m.nameChanged());
    Object.defineProperty(model, "name", { value: "Hadad", enumerable: true, configurable: true });
    assertNotPredicate(model, (m) => m.nameChanged());
    model.nameWillChange();
    Object.defineProperty(model, "name", { value: "Baal", enumerable: true, configurable: true });
    assertPredicate(model, (m) => m.nameChanged());
  });

  it("resetting attribute", () => {
    model.name = "Bob";
    model.restoreName();
    assertNil(model.name);
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
    assertPredicate(model, (m) => m.namePreviouslyChanged());
  });

  it("checking if an attribute was previously changed to a particular value", () => {
    model.name = "Ringo";
    model.save();
    assert(model.namePreviouslyChanged({ from: null, to: "Ringo" }));
    assertNot(model.namePreviouslyChanged({ from: "Pete", to: "Ringo" }));
    assert(model.namePreviouslyChanged({ to: "Ringo" }));
    assertNot(model.namePreviouslyChanged({ to: "Pete" }));
    assert(model.namePreviouslyChanged({ from: null }));
    assertNot(model.namePreviouslyChanged({ from: "Pete" }));
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

  it("model can be dup-ed without Attributes", () => {
    expect(model.dup()).toBeTruthy();
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
