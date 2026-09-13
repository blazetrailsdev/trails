import type { Club } from "./club.js";
import { Base } from "../../base.js";

export class Sponsor extends Base {
  declare sponsorClub: Club | null | Promise<Club | null>;
  declare sponsorable: Base | null | Promise<Base | null>;
  declare sponsor: Base | null | Promise<Base | null>;
  declare thing: Base | null | Promise<Base | null>;
  declare sponsorableWithConditions: Base | null | Promise<Base | null>;
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
    this.belongsTo("sponsorableWithConditions", (q: any) => q.where({ name: "Ernie" }), {
      polymorphic: true,
      foreignType: "sponsorable_type",
      foreignKey: "sponsorable_id",
    });
  }
}
