// vendor/rails/activerecord/test/models/owner.rb
import { Base } from "../../base.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";

export class Owner extends Base {
  private _blocks: Array<(owner: Owner) => void | Promise<void>> = [];

  static {
    this._primaryKey = "owner_id";
    this.hasMany("pets", { scope: (q: any) => q.order("pets.name desc") });
    this.hasMany("toys", { through: "pets" });
    this.hasMany("persons", { through: "pets" });
    this.belongsTo("lastPet", { className: "Pet" });
    this.scope("includingLastPet", (q: any) =>
      q
        .select(
          `
          owners.*, (
            select p.pet_id from pets p
            where p.owner_id = owners.owner_id
            order by p.name desc
            limit 1
          ) as last_pet_id
        `,
        )
        .includes("lastPet"),
    );
    this.afterCommit(async function (this: Owner) {
      await this.executeBlocks();
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
