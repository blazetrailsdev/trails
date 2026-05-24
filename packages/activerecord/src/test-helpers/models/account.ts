// vendor/rails/activerecord/test/models/account.rb
import { Base } from "../../base.js";

export class Account extends Base {
  static _destroyedAccountIds: Map<number | string, (number | string)[]> = new Map();

  static destroyedAccountIds(): Map<number | string, (number | string)[]> {
    return Account._destroyedAccountIds;
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

    this.beforeDestroy(function (this: Account) {
      const firm = (this as any).firm;
      if (firm) {
        const ids = Account.destroyedAccountIds();
        if (!ids.has(firm.id)) ids.set(firm.id, []);
        ids.get(firm.id)!.push((this as any).id);
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
