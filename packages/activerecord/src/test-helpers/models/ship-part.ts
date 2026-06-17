import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import type { Ship } from "./ship.js";
import type { Treasure } from "./treasure.js";
// vendor/rails/activerecord/test/models/ship_part.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class ShipPart extends Base {
  declare ship: Ship | null;
  declare trinkets: AssociationProxy<Treasure>;
  declare loadBelongsTo: (name: "ship") => Promise<Ship | null>;
  declare name: string;
  declare ship_id: number;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static {
    this.belongsTo("ship");
    this.hasMany("trinkets", { className: "Treasure", as: "looter" });

    this.validates("name", { presence: true });
  }
}

acceptsNestedAttributesFor(ShipPart, "trinkets", { allowDestroy: true });
acceptsNestedAttributesFor(ShipPart, "ship");
