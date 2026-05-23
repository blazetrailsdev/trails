// vendor/rails/activerecord/test/models/sponsor.rb
import { Base } from "../../base.js";

export class Sponsor extends Base {
  static {
    this.belongsTo("sponsorClub", { className: "Club", foreignKey: "club_id" });
    this.belongsTo("sponsorable", { polymorphic: true });
    this.belongsTo("sponsor", { polymorphic: true });
    this.belongsTo("thing", {
      polymorphic: true,
      foreignType: "sponsorable_type",
      foreignKey: "sponsorable_id",
    });
    this.belongsTo("sponsorableWithConditions", {
      scope: (q: any) => q.where({ name: "Ernie" }),
      polymorphic: true,
      foreignType: "sponsorable_type",
      foreignKey: "sponsorable_id",
    });
  }
}
