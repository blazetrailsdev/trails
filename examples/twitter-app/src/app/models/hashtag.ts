import type { Relation } from "@blazetrails/activerecord";
import { ApplicationRecord } from "./application-record.js";

export class Hashtag extends ApplicationRecord {
  static {
    // No join model and no `through:` — ActiveRecord resolves the join table
    // from the two table names alphabetically, so this is `hashtags_tweets`.
    this.hasAndBelongsToMany("tweets");

    this.validates("name", { presence: true });
    this.validatesUniqueness("name");

    this.scope("alphabetical", (q: Relation<Hashtag>) => q.order({ name: "asc" }));

    // Hashtags are matched case-insensitively, so they are stored folded.
    this.beforeValidation(function (this: Hashtag) {
      if (this.name != null) this.name = String(this.name).toLowerCase().replace(/^#/, "");
    });
  }

  /** `#trails` and `#Trails` are the same tag. */
  static async findOrCreateByName(name: string): Promise<Hashtag> {
    const normalized = name.toLowerCase().replace(/^#/, "");
    return (
      (await this.findBy({ name: normalized })) ?? (await this.createBang({ name: normalized }))
    );
  }
}
