import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Ship } from "./ship.js";
import type { Treasure } from "./treasure.js";
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class ShipPart extends Base {
  declare trinkets: AssociationProxy<Treasure>;
  declare name: string;
  declare ship_id: number;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  static {
    this.belongsTo("ship");
    this.hasMany("trinkets", { className: "Treasure", as: "looter" });

    this.validates("name", { presence: true });
  }
}
export interface ShipPart {
  get ship(): Ship | null | Promise<Ship | null>;
  set ship(value: Ship | null);
}

acceptsNestedAttributesFor(ShipPart, "trinkets", { allowDestroy: true });
acceptsNestedAttributesFor(ShipPart, "ship");
