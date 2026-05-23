// vendor/rails/activerecord/test/models/parrot.rb
import { Base } from "../../base.js";

export class Parrot extends Base {
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
    throw "abort";
  }

  incrementUpdatedCount() {
    (this as any).updatedCount = ((this as any).updatedCount ?? 0) + 1;
  }
}

export class LiveParrot extends Parrot {
  static {
    this.enum("breed", { african: 0, australian: 1 });
  }
}

export class DeadParrot extends Parrot {
  static {
    this.belongsTo("killer", { className: "Pirate", foreignKey: "killer_id" });
  }
}
