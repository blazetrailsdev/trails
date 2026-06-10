// vendor/rails/activerecord/test/models/account.rb
import { Base } from "../../base.js";

export class Account extends Base {
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
      // Only track when the association is a materialized record (not a pending
      // Promise from an unloaded belongs_to).
      if (firm && typeof firm === "object" && !("then" in firm) && firm.id != null) {
        const ids = Account.destroyedAccountIds();
        if (!ids.has(firm.id)) ids.set(firm.id, []);
        ids.get(firm.id)!.push(self.id);
      }
    });

    this.validate("checkEmptyCreditLimit");
    this.validate("ensureGoodCredit", { on: "bankLoan" });
  }

  checkEmptyCreditLimit() {
    const v = (this as any).creditLimit;
    if (v == null || String(v).trim() === "") {
      (this as any).errors.add("credit_limit", "blank");
    }
  }

  ensureGoodCredit() {
    if (!((this as any).creditLimit > 10_000)) {
      (this as any).errors.add("credit_limit", "too low");
    }
  }

  private privateMethod() {
    return "Sir, yes sir!";
  }
}

export class SubAccount extends Account {}
