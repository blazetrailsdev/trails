/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Ports vendor/rails/activerecord/test/cases/callbacks_test.rb. Every model
 * below rides the canonical `developers` table (Rails `self.table_name =
 * "developers"`); rows come from the `developers` fixtures (`name(:david)` is
 * id 1).
 */
import { describe, it, expect } from "vitest";
import { makeRange, throwAbort } from "@blazetrails/activesupport";
import { Base, RecordNotSaved, RecordNotDestroyed, RecordInvalid } from "./index.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { ContextualCallbacksDeveloper } from "./test-helpers/models/contextual-callbacks-developer.js";

type HistoryEntry = [string, string];

// Rails' `ActiveRecord::Callbacks::CALLBACKS.each` loop, minus the `around_*`
// hooks (Rails `next if callback_method.start_with?("around_")`) and
// `after_touch` (no trails equivalent — it never fires in the asserted
// histories below). For each hook, Rails registers four callbacks in order —
// a method, a proc, a callback object, and a block — and each pushes its own
// `[callback_method, kind]` pair onto the instance `history`.
const CALLBACK_METHODS = [
  "afterInitialize",
  "afterFind",
  "beforeValidation",
  "afterValidation",
  "beforeSave",
  "afterSave",
  "beforeCreate",
  "afterCreate",
  "beforeUpdate",
  "afterUpdate",
  "beforeDestroy",
  "afterDestroy",
  "afterCommit",
  "afterRollback",
] as const;

function snakeCase(camel: string): string {
  return camel.replace(/([A-Z])/g, "_$1").toLowerCase();
}

function registerCallbackHistory(klass: typeof Base): void {
  for (const cm of CALLBACK_METHODS) {
    const name = snakeCase(cm);
    const register = (klass as any)[cm].bind(klass);
    for (const kind of ["method", "proc", "object", "block"] as const) {
      register((model: any) => model.history.push([name, kind]));
    }
  }
}

class CallbackDeveloper extends Base {
  declare name: string;
  declare salary: number;
  // `history` memoizes like Rails' `@history ||= []`; a `declare` field emits
  // no initializer, so the `after_initialize` callbacks that fire inside the
  // Base constructor aren't clobbered by a class-field reset.
  declare private _history?: HistoryEntry[];
  get history(): HistoryEntry[] {
    return (this._history ??= []);
  }

  static {
    this.tableName = "developers";
    this.attribute("name", "string");
    this.attribute("salary", "integer");
    registerCallbackHistory(this);
  }
}

class CallbackDeveloperWithHaltedValidation extends CallbackDeveloper {
  static {
    this.beforeValidation((model: CallbackDeveloperWithHaltedValidation) => {
      model.history.push(["before_validation", "throwing_abort"]);
      throwAbort();
    });
    this.beforeValidation((model: CallbackDeveloperWithHaltedValidation) => {
      model.history.push(["before_validation", "should_never_get_here"]);
    });
  }
}

class ParentDeveloper extends Base {
  declare name: string;
  afterSaveCalled = false;

  static {
    this.tableName = "developers";
    this.attribute("name", "string");
    this.attribute("salary", "integer");
    this.beforeValidation((record: ParentDeveloper) => {
      record.afterSaveCalled = true;
    });
  }
}

class ChildDeveloper extends ParentDeveloper {}

class ImmutableDeveloper extends Base {
  declare salary: number;

  static {
    this.tableName = "developers";
    this.attribute("name", "string");
    this.attribute("salary", "integer");
    this.validates("salary", { inclusion: { in: makeRange(50000, 200000) } });
    this.beforeSave((record: ImmutableDeveloper) => record.cancel());
    this.beforeDestroy((record: ImmutableDeveloper) => record.cancel());
  }

  private cancel(): boolean {
    return false;
  }
}

class DeveloperWithCanceledCallbacks extends Base {
  declare salary: number;

  static {
    this.tableName = "developers";
    this.attribute("name", "string");
    this.attribute("salary", "integer");
    this.validates("salary", { inclusion: { in: makeRange(50000, 200000) } });
    this.beforeSave((record: DeveloperWithCanceledCallbacks) => record.cancel());
    this.beforeDestroy((record: DeveloperWithCanceledCallbacks) => record.cancel());
  }

  private cancel(): void {
    throwAbort();
  }
}

class OnCallbacksDeveloper extends Base {
  declare name: string;
  declare salary: number;
  declare private _history?: string[];
  get history(): string[] {
    return (this._history ??= []);
  }

  static {
    this.tableName = "developers";
    this.attribute("name", "string");
    this.attribute("salary", "integer");

    this.beforeValidation((r: OnCallbacksDeveloper) => r.history.push("before_validation"));
    this.beforeValidation(
      (r: OnCallbacksDeveloper) => r.history.push("before_validation_on_create"),
      { on: "create" },
    );
    this.beforeValidation(
      (r: OnCallbacksDeveloper) => r.history.push("before_validation_on_update"),
      { on: "update" },
    );

    this.validate((r: OnCallbacksDeveloper) => r.history.push("validate"));

    this.afterValidation((r: OnCallbacksDeveloper) => r.history.push("after_validation"));
    this.afterValidation(
      (r: OnCallbacksDeveloper) => r.history.push("after_validation_on_create"),
      { on: "create" },
    );
    this.afterValidation(
      (r: OnCallbacksDeveloper) => r.history.push("after_validation_on_update"),
      { on: "update" },
    );
  }
}

class CallbackHaltedDeveloper extends Base {
  declare salary: number;
  afterSaveCalled = false;
  afterCreateCalled = false;
  afterUpdateCalled = false;
  afterDestroyCalled = false;
  // `attr_accessor` ivars are undefined until assigned. `before_save` mirrors
  // Rails' `defined?(@cancel_before_save)` (halts on ANY assignment, even
  // `false`); the create/update/destroy guards mirror the truthy
  // `@cancel_before_*` checks. (callbacks_test.rb:135-149)
  declare cancelBeforeSave?: boolean;
  cancelBeforeCreate?: boolean;
  cancelBeforeUpdate?: boolean;
  cancelBeforeDestroy?: boolean;

  static {
    this.tableName = "developers";
    this.attribute("name", "string");
    this.attribute("salary", "integer");

    this.beforeSave((r: CallbackHaltedDeveloper) => {
      if (r.cancelBeforeSave !== undefined) throwAbort();
    });
    this.beforeCreate((r: CallbackHaltedDeveloper) => {
      if (r.cancelBeforeCreate) throwAbort();
    });
    this.beforeUpdate((r: CallbackHaltedDeveloper) => {
      if (r.cancelBeforeUpdate) throwAbort();
    });
    this.beforeDestroy((r: CallbackHaltedDeveloper) => {
      if (r.cancelBeforeDestroy) throwAbort();
    });

    this.afterSave((r: CallbackHaltedDeveloper) => {
      r.afterSaveCalled = true;
    });
    this.afterUpdate((r: CallbackHaltedDeveloper) => {
      r.afterUpdateCalled = true;
    });
    this.afterCreate((r: CallbackHaltedDeveloper) => {
      r.afterCreateCalled = true;
    });
    this.afterDestroy((r: CallbackHaltedDeveloper) => {
      r.afterDestroyCalled = true;
    });
  }
}

setupHandlerSuite();
const { developers } = useHandlerFixtures(["developers"], { schema: canonicalSchema });

function assertSaveCallbacksNotCalled(someone: CallbackHaltedDeveloper): void {
  expect(someone.afterSaveCalled).toBe(false);
  expect(someone.afterCreateCalled).toBe(false);
  expect(someone.afterUpdateCalled).toBe(false);
}

describe("CallbacksTest", () => {
  it("initialize", () => {
    const david = new CallbackDeveloper();
    expect(david.history).toEqual([
      ["after_initialize", "method"],
      ["after_initialize", "proc"],
      ["after_initialize", "object"],
      ["after_initialize", "block"],
    ]);
  });

  it("find", async () => {
    const david = await CallbackDeveloper.find(developers("david").id);
    expect(david.history).toEqual([
      ["after_find", "method"],
      ["after_find", "proc"],
      ["after_find", "object"],
      ["after_find", "block"],
      ["after_initialize", "method"],
      ["after_initialize", "proc"],
      ["after_initialize", "object"],
      ["after_initialize", "block"],
    ]);
  });

  it("new valid?", async () => {
    const david = new CallbackDeveloper();
    await david.isValid();
    expect(david.history).toEqual([
      ["after_initialize", "method"],
      ["after_initialize", "proc"],
      ["after_initialize", "object"],
      ["after_initialize", "block"],
      ["before_validation", "method"],
      ["before_validation", "proc"],
      ["before_validation", "object"],
      ["before_validation", "block"],
      ["after_validation", "method"],
      ["after_validation", "proc"],
      ["after_validation", "object"],
      ["after_validation", "block"],
    ]);
  });

  it("existing valid?", async () => {
    const david = await CallbackDeveloper.find(developers("david").id);
    await david.isValid();
    expect(david.history).toEqual([
      ["after_find", "method"],
      ["after_find", "proc"],
      ["after_find", "object"],
      ["after_find", "block"],
      ["after_initialize", "method"],
      ["after_initialize", "proc"],
      ["after_initialize", "object"],
      ["after_initialize", "block"],
      ["before_validation", "method"],
      ["before_validation", "proc"],
      ["before_validation", "object"],
      ["before_validation", "block"],
      ["after_validation", "method"],
      ["after_validation", "proc"],
      ["after_validation", "object"],
      ["after_validation", "block"],
    ]);
  });

  it("create", async () => {
    const david = await CallbackDeveloper.create({ name: "David", salary: 1000000 });
    expect(david.history).toEqual([
      ["after_initialize", "method"],
      ["after_initialize", "proc"],
      ["after_initialize", "object"],
      ["after_initialize", "block"],
      ["before_validation", "method"],
      ["before_validation", "proc"],
      ["before_validation", "object"],
      ["before_validation", "block"],
      ["after_validation", "method"],
      ["after_validation", "proc"],
      ["after_validation", "object"],
      ["after_validation", "block"],
      ["before_save", "method"],
      ["before_save", "proc"],
      ["before_save", "object"],
      ["before_save", "block"],
      ["before_create", "method"],
      ["before_create", "proc"],
      ["before_create", "object"],
      ["before_create", "block"],
      ["after_create", "method"],
      ["after_create", "proc"],
      ["after_create", "object"],
      ["after_create", "block"],
      ["after_save", "method"],
      ["after_save", "proc"],
      ["after_save", "object"],
      ["after_save", "block"],
      ["after_commit", "block"],
      ["after_commit", "object"],
      ["after_commit", "proc"],
      ["after_commit", "method"],
    ]);
  });

  it("validate on create", async () => {
    const david = await OnCallbacksDeveloper.create({ name: "David", salary: 1000000 });
    expect(david.history).toEqual([
      "before_validation",
      "before_validation_on_create",
      "validate",
      "after_validation",
      "after_validation_on_create",
    ]);
  });

  it("validate on contextual create", async () => {
    const david = await ContextualCallbacksDeveloper.create({
      name: "David",
      salary: 1000000,
    });
    expect(david.history).toEqual([
      "before_validation",
      "before_validation_on_create",
      "validate",
      "after_validation",
      "after_validation_on_create",
    ]);
  });

  it("update", async () => {
    const david = await CallbackDeveloper.find(developers("david").id);
    await david.save();
    expect(david.history).toEqual([
      ["after_find", "method"],
      ["after_find", "proc"],
      ["after_find", "object"],
      ["after_find", "block"],
      ["after_initialize", "method"],
      ["after_initialize", "proc"],
      ["after_initialize", "object"],
      ["after_initialize", "block"],
      ["before_validation", "method"],
      ["before_validation", "proc"],
      ["before_validation", "object"],
      ["before_validation", "block"],
      ["after_validation", "method"],
      ["after_validation", "proc"],
      ["after_validation", "object"],
      ["after_validation", "block"],
      ["before_save", "method"],
      ["before_save", "proc"],
      ["before_save", "object"],
      ["before_save", "block"],
      ["before_update", "method"],
      ["before_update", "proc"],
      ["before_update", "object"],
      ["before_update", "block"],
      ["after_update", "method"],
      ["after_update", "proc"],
      ["after_update", "object"],
      ["after_update", "block"],
      ["after_save", "method"],
      ["after_save", "proc"],
      ["after_save", "object"],
      ["after_save", "block"],
      ["after_commit", "block"],
      ["after_commit", "object"],
      ["after_commit", "proc"],
      ["after_commit", "method"],
    ]);
  });

  it("validate on update", async () => {
    const david = await OnCallbacksDeveloper.find(developers("david").id);
    await david.save();
    expect(david.history).toEqual([
      "before_validation",
      "before_validation_on_update",
      "validate",
      "after_validation",
      "after_validation_on_update",
    ]);
  });

  it("validate on contextual update", async () => {
    const david = await ContextualCallbacksDeveloper.find(developers("david").id);
    await david.save();
    expect(david.history).toEqual([
      "before_validation",
      "before_validation_on_update",
      "validate",
      "after_validation",
      "after_validation_on_update",
    ]);
  });

  it("destroy", async () => {
    const david = await CallbackDeveloper.find(developers("david").id);
    await david.destroy();
    expect(david.history).toEqual([
      ["after_find", "method"],
      ["after_find", "proc"],
      ["after_find", "object"],
      ["after_find", "block"],
      ["after_initialize", "method"],
      ["after_initialize", "proc"],
      ["after_initialize", "object"],
      ["after_initialize", "block"],
      ["before_destroy", "method"],
      ["before_destroy", "proc"],
      ["before_destroy", "object"],
      ["before_destroy", "block"],
      ["after_destroy", "method"],
      ["after_destroy", "proc"],
      ["after_destroy", "object"],
      ["after_destroy", "block"],
      ["after_commit", "block"],
      ["after_commit", "object"],
      ["after_commit", "proc"],
      ["after_commit", "method"],
    ]);
  });

  it("delete", async () => {
    const david = await CallbackDeveloper.find(developers("david").id);
    await CallbackDeveloper.delete(david.id);
    expect(david.history).toEqual([
      ["after_find", "method"],
      ["after_find", "proc"],
      ["after_find", "object"],
      ["after_find", "block"],
      ["after_initialize", "method"],
      ["after_initialize", "proc"],
      ["after_initialize", "object"],
      ["after_initialize", "block"],
    ]);
  });

  it("before create throwing abort", async () => {
    const someone = new CallbackHaltedDeveloper();
    someone.cancelBeforeCreate = true;
    expect(await someone.isValid()).toBe(true);
    expect(await someone.save()).toBe(false);
    assertSaveCallbacksNotCalled(someone);
  });

  it("before save throwing abort", async () => {
    let david = await DeveloperWithCanceledCallbacks.find(developers("david").id);
    expect(await david.isValid()).toBe(true);
    expect(await david.save()).toBe(false);
    const exc = await david.saveBang().then(
      () => null,
      (e: unknown) => e,
    );
    expect(exc).toBeInstanceOf(RecordNotSaved);
    expect((exc as RecordNotSaved).record).toBe(david);

    david = await DeveloperWithCanceledCallbacks.find(developers("david").id);
    david.salary = 10_000_000;
    expect(await david.isValid()).toBe(false);
    expect(await david.save()).toBe(false);
    await expect(david.saveBang()).rejects.toThrow(RecordInvalid);

    const someone = await CallbackHaltedDeveloper.find(developers("david").id);
    someone.cancelBeforeSave = true;
    expect(await someone.isValid()).toBe(true);
    expect(await someone.save()).toBe(false);
    assertSaveCallbacksNotCalled(someone);
  });

  it("before update throwing abort", async () => {
    const someone = await CallbackHaltedDeveloper.find(developers("david").id);
    someone.cancelBeforeUpdate = true;
    expect(await someone.isValid()).toBe(true);
    expect(await someone.save()).toBe(false);
    assertSaveCallbacksNotCalled(someone);
  });

  it("before destroy throwing abort", async () => {
    const david = await DeveloperWithCanceledCallbacks.find(developers("david").id);
    expect(await david.destroy()).toBe(false);
    const exc = await david.destroyBang().then(
      () => null,
      (e: unknown) => e,
    );
    expect(exc).toBeInstanceOf(RecordNotDestroyed);
    expect((exc as RecordNotDestroyed).record).toBe(david);
    expect(await ImmutableDeveloper.findBy({ id: developers("david").id })).not.toBeNull();

    const someone = await CallbackHaltedDeveloper.find(developers("david").id);
    someone.cancelBeforeDestroy = true;
    expect(await someone.destroy()).toBe(false);
    await expect(someone.destroyBang()).rejects.toThrow(RecordNotDestroyed);
    expect(someone.afterDestroyCalled).toBe(false);
  });

  it("callback throwing abort", async () => {
    const david = await CallbackDeveloperWithHaltedValidation.find(developers("david").id);
    await david.save();
    expect(david.history).toEqual([
      ["after_find", "method"],
      ["after_find", "proc"],
      ["after_find", "object"],
      ["after_find", "block"],
      ["after_initialize", "method"],
      ["after_initialize", "proc"],
      ["after_initialize", "object"],
      ["after_initialize", "block"],
      ["before_validation", "method"],
      ["before_validation", "proc"],
      ["before_validation", "object"],
      ["before_validation", "block"],
      ["before_validation", "throwing_abort"],
    ]);
  });

  it("inheritance of callbacks", async () => {
    const parent = new ParentDeveloper();
    expect(parent.afterSaveCalled).toBe(false);
    await parent.save();
    expect(parent.afterSaveCalled).toBe(true);

    const child = new ChildDeveloper();
    expect(child.afterSaveCalled).toBe(false);
    await child.save();
    expect(child.afterSaveCalled).toBe(true);
  });

  it("before save doesnt allow on option", () => {
    expect(() => {
      class T extends Base {
        static {
          this.attribute("title", "string");
          this.beforeSave(() => {}, { on: "create" } as any);
        }
      }
      void T;
    }).toThrow("Unknown key: :on. Valid keys are: :if, :unless, :prepend");
  });

  it("around save doesnt allow on option", () => {
    expect(() => {
      class T extends Base {
        static {
          this.attribute("title", "string");
          this.aroundSave((_r, proceed) => proceed(), { on: "create" } as any);
        }
      }
      void T;
    }).toThrow("Unknown key: :on. Valid keys are: :if, :unless, :prepend");
  });

  it("after save doesnt allow on option", () => {
    expect(() => {
      class T extends Base {
        static {
          this.attribute("title", "string");
          this.afterSave(() => {}, { on: "create" } as any);
        }
      }
      void T;
    }).toThrow("Unknown key: :on. Valid keys are: :if, :unless, :prepend");
  });
});
