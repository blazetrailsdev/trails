import type { Club } from "./club.js";
// vendor/rails/activerecord/test/models/sponsor.rb
import { Base } from "../../base.js";

export class Sponsor extends Base {
  declare sponsorClub: Club | null;
  declare sponsorable: Base | null;
  declare sponsor: Base | null;
  declare thing: Base | null;
  declare sponsorableWithConditions: Base | null;
  declare loadBelongsTo: ((name: "sponsorClub") => Promise<Club | null>) &
    ((name: "sponsorable") => Promise<Base | null>) &
    ((name: "sponsor") => Promise<Base | null>) &
    ((name: "thing") => Promise<Base | null>) &
    ((name: "sponsorableWithConditions") => Promise<Base | null>);
  declare club_id: number;
  declare sponsor_id: number;
  declare sponsor_type: string;
  declare sponsorable_id: number;
  declare sponsorable_type: string;

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
