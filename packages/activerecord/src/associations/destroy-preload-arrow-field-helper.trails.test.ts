/**
 * trails-only regression (no Rails counterpart).
 *
 * The destroy `belongs_to` preload scan (`_preloadBelongsToForDestroyCallbacks`
 * / `expandCallbackSourcesWithHelpers`) resolves association reads reached
 * through a model-defined helper so a synchronous, un-awaited `belongs_to` read
 * inside that helper is preloaded before the sync reader runs. PR #4809 walked
 * only the prototype chain, so an **arrow-function class field**
 * (`makeReport = () => { ... this.firm }`) — which lives on the *instance*, not
 * the prototype — was invisible to the scan. This exercises that gap: a destroy
 * callback that dereferences `firm` through an arrow-field helper must see the
 * loaded `Company`, not the async reader's Promise.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel, registerSubclass } from "../index.js";
import {
  Company,
  Firm,
  DependentFirm,
  ExclusivelyDependentFirm,
  RestrictedWithExceptionFirm,
  RestrictedWithErrorFirm,
  Client,
} from "../test-helpers/models/company.js";
import { fixtures } from "../test-fixtures.js";

// Rides the canonical `accounts` table (no bespoke schema). The arrow-field
// helper `recordFirm` reads `this.firm` synchronously and captures whether the
// value was the loaded record or trails' async-reader thenable.
class ArrowFieldAccount extends Base {
  static _tableName = "accounts";
  declare firm: Company | null;
  declare firm_id: number;

  static _seenFirmIsThenable: boolean | null = null;
  static _seenFirmId: number | undefined = undefined;

  // Arrow-function class field — lives on the instance, not the prototype. The
  // `this.firm` read must be lexical here (not delegated to a free function) so
  // the callback-source scan can see the association name.
  recordFirm = (): void => {
    const firm = this.firm as { then?: unknown; id?: number } | null;
    ArrowFieldAccount._seenFirmIsThenable = typeof firm?.then === "function";
    ArrowFieldAccount._seenFirmId = firm?.id;
  };

  static {
    this.belongsTo("firm", { className: "Company" });
    this.beforeDestroy(function (this: ArrowFieldAccount, record?: ArrowFieldAccount) {
      (record ?? this).recordFirm();
    });
  }
}

// Prototype-method helper (the PR #4809 path) — asserts that resolution through
// an ordinary prototype method is unchanged by the arrow-field expansion.
class ProtoHelperAccount extends Base {
  static _tableName = "accounts";
  declare firm: Company | null;
  declare firm_id: number;

  static _seenFirmIsThenable: boolean | null = null;
  static _seenFirmId: number | undefined = undefined;

  recordFirm(): void {
    const firm = this.firm as { then?: unknown; id?: number } | null;
    ProtoHelperAccount._seenFirmIsThenable = typeof firm?.then === "function";
    ProtoHelperAccount._seenFirmId = firm?.id;
  }

  static {
    this.belongsTo("firm", { className: "Company" });
    this.beforeDestroy(function (this: ProtoHelperAccount, record?: ProtoHelperAccount) {
      (record ?? this).recordFirm();
    });
  }
}

describe("destroy belongs_to preload through arrow-field helper", () => {
  const { accounts } = fixtures(["companies", "accounts"]);

  beforeAll(async () => {
    registerModel(Company);
    registerModel(Firm);
    registerModel(DependentFirm);
    registerModel(ExclusivelyDependentFirm);
    registerModel(RestrictedWithExceptionFirm);
    registerModel(RestrictedWithErrorFirm);
    registerModel(Client);
    Company.inheritanceColumn = "type";
    registerSubclass(Firm);
    registerSubclass(DependentFirm);
    registerSubclass(ExclusivelyDependentFirm);
    registerSubclass(RestrictedWithExceptionFirm);
    registerSubclass(RestrictedWithErrorFirm);
    registerSubclass(Client);
    registerModel("ArrowFieldAccount", ArrowFieldAccount);
    registerModel("ProtoHelperAccount", ProtoHelperAccount);
    await Company.loadSchema();
    await ArrowFieldAccount.loadSchema();
    await ProtoHelperAccount.loadSchema();
  });

  it("preloads the belongs_to a destroy callback reads through an arrow-field helper", async () => {
    ArrowFieldAccount._seenFirmIsThenable = null;
    ArrowFieldAccount._seenFirmId = undefined;
    const account = await ArrowFieldAccount.find((accounts("signals37") as { id: number }).id);
    expect(account.association("firm").isLoaded()).toBe(false);

    await account.destroy();

    // The sync reader inside the arrow field saw the loaded Company, not the
    // async reader's Promise.
    expect(ArrowFieldAccount._seenFirmIsThenable).toBe(false);
    expect(ArrowFieldAccount._seenFirmId).toBe(account.firm_id);
  });

  it("still preloads the belongs_to a destroy callback reads through a prototype helper", async () => {
    ProtoHelperAccount._seenFirmIsThenable = null;
    ProtoHelperAccount._seenFirmId = undefined;
    const account = await ProtoHelperAccount.find((accounts("signals37") as { id: number }).id);
    expect(account.association("firm").isLoaded()).toBe(false);

    await account.destroy();

    expect(ProtoHelperAccount._seenFirmIsThenable).toBe(false);
    expect(ProtoHelperAccount._seenFirmId).toBe(account.firm_id);
  });
});
