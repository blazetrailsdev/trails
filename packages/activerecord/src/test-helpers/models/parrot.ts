import { throwAbort } from "@blazetrails/activesupport";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Pirate } from "./pirate.js";
import type { Treasure } from "./treasure.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Parrot extends Base {
  declare pirates: AssociationProxy<Pirate>;
  declare treasures: AssociationProxy<Treasure>;
  declare loots: AssociationProxy<Treasure>;
  declare cancelSaveFromCallback: boolean;
  declare breed: "african" | "australian" | null;
  declare color: string;
  declare created_at: RubyTime | Temporal.PlainDateTime;
  declare created_on: RubyTime | Temporal.PlainDateTime;
  declare killer_id: number;
  declare name: string;
  declare nameChange: [unknown, unknown] | null;
  declare titleChanged: () => boolean;
  declare titleChange: [unknown, unknown] | null;
  declare titleWas: string | null;
  declare parrot_sti_class: string;
  declare updated_at: RubyTime | Temporal.PlainDateTime;
  declare updated_count: number | null;
  declare updated_on: RubyTime | Temporal.PlainDateTime;

  static {
    this.inheritanceColumn = "parrot_sti_class";
    this.hasAndBelongsToMany("pirates");
    this.hasAndBelongsToMany("treasures");
    this.hasMany("loots", { as: "looter", className: "Treasure" });
    this.aliasAttribute("title", "name");

    this.validates("name", { presence: true });

    this.attribute("cancelSaveFromCallback", "boolean");
    this.beforeSave(
      function (this: any) {
        this.cancelSaveCallbackMethod();
      },
      { if: (r: any) => r.readAttribute("cancelSaveFromCallback") },
    );
    this.beforeUpdate(function (this: any) {
      this.incrementUpdatedCount();
    });
  }

  static async deleteAll() {
    await this.withConnection(async (c: any) => {
      await c.delete("DELETE FROM parrots_pirates");
      await c.delete("DELETE FROM parrots_treasures");
    });
    return super.deleteAll();
  }

  cancelSaveCallbackMethod() {
    throwAbort();
  }

  incrementUpdatedCount() {
    this.updated_count = (this.updated_count ?? 0) + 1;
  }
}

export class LiveParrot extends Parrot {
  declare isAfrican: () => boolean;
  declare africanBang: () => Promise<true | undefined>;
  declare static african: () => Relation<LiveParrot>;
  declare static notAfrican: () => Relation<LiveParrot>;
  declare isAustralian: () => boolean;
  declare australianBang: () => Promise<true | undefined>;
  declare static australian: () => Relation<LiveParrot>;
  declare static notAustralian: () => Relation<LiveParrot>;

  static {
    this.enum("breed", { african: 0, australian: 1 });
  }
}

export class DeadParrot extends Parrot {
  declare killer: Pirate | null;
  declare loadBelongsTo: (name: "killer") => Promise<Pirate | null>;

  static {
    this.belongsTo("killer", { className: "Pirate", foreignKey: "killer_id" });
  }
}

registerModel(Parrot);
registerModel(LiveParrot);
registerModel(DeadParrot);
