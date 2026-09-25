import type { Club } from "./club.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Sponsor extends Base {
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
    this.belongsTo(
      "sponsorableWithConditions",
      function (this: any) {
        return this.where({ name: "Ernie" });
      },
      {
        polymorphic: true,
        foreignType: "sponsorable_type",
        foreignKey: "sponsorable_id",
      },
    );
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Sponsor {
  get sponsorClub(): Club | null | Promise<Club | null>;
  set sponsorClub(value: Club | null);
  get sponsorable(): Base | null | Promise<Base | null>;
  set sponsorable(value: Base | null);
  get sponsor(): Base | null | Promise<Base | null>;
  set sponsor(value: Base | null);
  get thing(): Base | null | Promise<Base | null>;
  set thing(value: Base | null);
  get sponsorableWithConditions(): Base | null | Promise<Base | null>;
  set sponsorableWithConditions(value: Base | null);
}
