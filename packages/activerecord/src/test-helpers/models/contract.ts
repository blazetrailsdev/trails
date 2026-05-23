// vendor/rails/activerecord/test/models/contract.rb
import { Base } from "../../base.js";

export class Contract extends Base {
  hiCount = 0;
  byeCount = 0;

  static {
    this.belongsTo("company");
    this.belongsTo("developer", { primaryKey: "id" });
    this.belongsTo("firm", { foreignKey: "company_id" });

    this.attribute("metadata", "json");

    this.beforeSave(async function (this: Contract) {
      await this.hi();
      await this.updateMetadata();
    });
    this.afterSave(async function (this: Contract) {
      await this.bye();
    });
  }

  async hi(): Promise<void> {
    this.hiCount = (this.hiCount ?? 0) + 1;
  }

  async bye(): Promise<void> {
    this.byeCount = (this.byeCount ?? 0) + 1;
  }

  async updateMetadata(): Promise<void> {
    const companyId = this.readAttribute("company_id") as number | null;
    const developerId = this.readAttribute("developer_id");
    const code = companyId != null ? companyId.toString(16).padStart(8, "0") : null;
    this.writeAttribute("metadata", { code, company_id: companyId, developer_id: developerId });
  }
}

export class NewContract extends Contract {
  static {
    this.validates("company_id", { presence: true });
  }
}

export class SpecialContract extends Base {
  static {
    this._tableName = "contracts";
    this.belongsTo("company");
    this.belongsTo("specialDeveloper", { foreignKey: "developer_id" });
  }
}
