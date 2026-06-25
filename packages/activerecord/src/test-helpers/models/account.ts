import type { Relation } from "../../relation.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import type { Company } from "./company.js";
import type { Firm } from "./company.js";
// vendor/rails/activerecord/test/models/account.rb
import { Base } from "../../base.js";

export class Account extends Base {
  declare firm: Company | null;
  declare unautosavedFirm: Firm | null;
  declare static open: () => Relation<Account>;
  declare static available: () => Relation<Account>;
  declare loadBelongsTo: ((name: "firm") => Promise<Company | null>) &
    ((name: "unautosavedFirm") => Promise<Firm | null>);
  declare credit_limit: number;
  declare firm_id: number;
  declare firm_name: string;
  declare status: string;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static _destroyedAccountIds: Map<number | string, (number | string)[]> = new Map();

  static destroyedAccountIds(): Map<number | string, (number | string)[]> {
    return this._destroyedAccountIds;
  }

  static {
    this.belongsTo("firm", { className: "Company" });
    this.belongsTo("unautosavedFirm", {
      foreignKey: "firm_id",
      className: "Firm",
      autosave: false,
    });

    this.aliasAttribute("availableCredit", "credit_limit");

    this.scope("open", (q: any) => q.where("firm_name = ?", "37signals"));
    this.scope("available", (q: any) => q.open());

    this.beforeDestroy(function (this: Account, record?: Account) {
      // The framework passes the record as the first argument; `this` may be
      // unbound depending on the callback dispatch path. Prefer the argument.
      const self = (record ?? this) as any;
      const firm = self?.firm;
      // Mirrors Rails `before_destroy { |account| ... if account.firm }`. The
      // dependent-destroy cascade preloads `account.firm` so this sync reader
      // sees a materialized record; `firm.id != null` still guards the rare
      // path where an unloaded belongs_to surfaces the async reader's Promise.
      if (firm && firm.id != null) {
        const ids = Account.destroyedAccountIds();
        if (!ids.has(firm.id)) ids.set(firm.id, []);
        ids.get(firm.id)!.push(self.id);
      }
    });

    this.validate("checkEmptyCreditLimit");
    this.validate("ensureGoodCredit", { on: "bankLoan" });
  }

  checkEmptyCreditLimit() {
    const v = (this as any).credit_limit;
    if (v == null || String(v).trim() === "") {
      (this as any).errors.add("credit_limit", "blank");
    }
  }

  ensureGoodCredit() {
    if (!((this as any).credit_limit > 10_000)) {
      (this as any).errors.add("credit_limit", "too low");
    }
  }

  private privateMethod() {
    return "Sir, yes sir!";
  }
}

export class SubAccount extends Account {}
