import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Person } from "./person.js";
import type { Pet } from "./pet.js";
import type { Toy } from "./toy.js";
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Owner extends Base {
  declare pets: AssociationProxy<Pet>;
  declare toys: AssociationProxy<Toy>;
  declare persons: AssociationProxy<Person>;
  declare lastPet: Pet | null;
  declare static includingLastPet: () => Relation<Owner>;
  declare loadBelongsTo: (name: "lastPet") => Promise<Pet | null>;
  declare essay_id: string;
  declare happy_at: RubyTime | Temporal.PlainDateTime;
  declare name: string;
  declare owner_id: number;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  private _blocks: Array<(owner: Owner) => void | Promise<void>> = [];

  static {
    this._primaryKey = "owner_id";
    this.hasMany("pets", (q: any) => q.order("pets.name desc"));
    this.hasMany("toys", { through: "pets" });
    this.hasMany("persons", { through: "pets" });
    this.belongsTo("lastPet", { className: "Pet" });
    this.scope("includingLastPet", function (this: any) {
      return this.select(
        `
          owners.*, (
            select p.pet_id from pets p
            where p.owner_id = owners.owner_id
            order by p.name desc
            limit 1
          ) as last_pet_id
        `,
      ).includes(":lastPet");
    });
    this.afterCommit(async (owner: Owner) => {
      await owner.executeBlocks();
    });
  }

  get blocks(): Array<(owner: Owner) => void | Promise<void>> {
    return this._blocks;
  }

  onAfterCommit(block: (owner: Owner) => void | Promise<void>) {
    this._blocks.push(block);
  }

  async executeBlocks() {
    const blocks = this._blocks;
    this._blocks = [];
    for (const block of blocks) {
      await block(this);
    }
  }
}

acceptsNestedAttributesFor(Owner, "pets", { allowDestroy: true });

export class InvalidOwner extends Owner {
  static {
    this.validate(function (this: InvalidOwner) {
      (this as any).errors.add("base", ":invalid");
    });
  }
}
