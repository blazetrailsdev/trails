import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "../index.js";
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
import { captureSql } from "../testing/sql-capture.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ArrowFieldAccount extends Base {
  static _tableName = "accounts";
  declare firm_id: number;

  static _seenFirmIsThenable: boolean | null = null;
  static _seenFirmId: number | undefined = undefined;

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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ArrowFieldAccount {
  get firm(): Company | null | Promise<Company | null>;
  set firm(value: Company | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ProtoHelperAccount extends Base {
  static _tableName = "accounts";
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ProtoHelperAccount {
  get firm(): Company | null | Promise<Company | null>;
  set firm(value: Company | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ReentrantDestroyAccount extends Base {
  static _tableName = "accounts";
  declare firm_id: number;

  static _reentrantResult: unknown = undefined;

  static {
    this.belongsTo("firm", { className: "Company" });
    this.beforeDestroy(async function (
      this: ReentrantDestroyAccount,
      record?: ReentrantDestroyAccount,
    ) {
      const account = record ?? this;
      void account.firm;
      ReentrantDestroyAccount._reentrantResult = await account.destroy();
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ReentrantDestroyAccount {
  get firm(): Company | null | Promise<Company | null>;
  set firm(value: Company | null);
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
    registerModel(Firm);
    registerModel(DependentFirm);
    registerModel(ExclusivelyDependentFirm);
    registerModel(RestrictedWithExceptionFirm);
    registerModel(RestrictedWithErrorFirm);
    registerModel(Client);
    registerModel("ArrowFieldAccount", ArrowFieldAccount);
    registerModel("ProtoHelperAccount", ProtoHelperAccount);
    registerModel("ReentrantDestroyAccount", ReentrantDestroyAccount);
    await Company.loadSchema();
    await ArrowFieldAccount.loadSchema();
    await ProtoHelperAccount.loadSchema();
    await ReentrantDestroyAccount.loadSchema();
  });

  it("preloads the belongs_to a destroy callback reads through an arrow-field helper", async () => {
    ArrowFieldAccount._seenFirmIsThenable = null;
    ArrowFieldAccount._seenFirmId = undefined;
    const account = await ArrowFieldAccount.find((accounts("signals37") as { id: number }).id);
    expect(account.association("firm").isLoaded()).toBe(false);

    await account.destroy();

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

  it("a re-entrant destroy answers true and does not load the belongs_to again", async () => {
    ReentrantDestroyAccount._reentrantResult = undefined;
    const account = await ReentrantDestroyAccount.find(
      (accounts("signals37") as { id: number }).id,
    );

    const sqls = await captureSql(() => account.destroy());

    expect(ReentrantDestroyAccount._reentrantResult).toBe(true);
    expect(sqls.filter((sql) => /^SELECT\b.*\bcompanies\b/i.test(sql))).toHaveLength(1);
    expect(account.isDestroyed()).toBe(true);
  });
});
