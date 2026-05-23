// vendor/rails/activerecord/test/models/autoloadable/extra_firm.rb
// ExtraFirm extends Company in Rails; Company (company.rb) not yet ported — extends Base.
import { Base } from "../../../base.js";

export class ExtraFirm extends Base {
  static _tableName = "companies";
}
