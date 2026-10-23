import { Base, registerModel } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

export class Company extends Base {
  declare rating: number | null;

  static {
    this.hasOne("mascot");
    this.sequenceName = "companies_nonstd_seq";

    this.validatesPresenceOf("name");
  }
}
Object.assign(Company.prototype, {
  validate(this: Company): void {
    if (this.rating === 2) this.errors.add("rating", "rating should not be 2");
  },
});
(TopLevel as { Company?: typeof Company }).Company = Company;
registerModel(Company);
