// vendor/rails/activerecord/test/models/person.rb
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";
import { Base } from "../../base.js";

export class Person extends Base {
  static {
    this.hasMany("readers");
    this.hasMany("secureReaders");
    this.hasOne("reader");

    this.hasMany("posts", { through: "readers" });
    this.hasMany("securePosts", { through: "secureReaders" });
    this.hasMany("postsWithNoComments", {
      scope: (q: any) => q.includes("comments").where("comments.id is null").references("comments"),
      through: "readers",
      source: "post",
    });

    this.hasMany("friendships", { foreignKey: "friend_id" });
    this.hasMany("friendsToo", { foreignKey: "friend_id", className: "Friendship" });
    this.hasMany("followers", { through: "friendships" });

    this.hasMany("references");
    this.hasMany("badReferences");
    this.hasMany("fixedBadReferences", {
      scope: (q: any) => q.where({ favorite: true }),
      className: "BadReference",
    });
    this.hasOne("favoriteReference", {
      scope: (q: any) => q.where({ favorite: true }),
      className: "Reference",
    });
    this.hasOne("favoriteReferenceJob", { through: "favoriteReference", source: "job" });
    this.hasMany("postsWithCommentsSortedByCommentId", {
      scope: (q: any) => q.includes("comments").order("comments.id"),
      through: "readers",
      source: "post",
    });
    this.hasMany("firstPosts", { scope: (q: any) => q.where({ id: [1, 2] }), through: "readers" });

    this.hasMany("jobs", { through: "references" });
    this.hasMany("jobsWithDependentDestroy", {
      source: "job",
      through: "references",
      dependent: "destroy",
    });
    this.hasMany("jobsWithDependentDeleteAll", {
      source: "job",
      through: "references",
      dependent: "delete",
    });
    this.hasMany("jobsWithDependentNullify", {
      source: "job",
      through: "references",
      dependent: "nullify",
    });

    this.belongsTo("primaryContact", { className: "Person" });
    this.hasMany("agents", { className: "Person", foreignKey: "primary_contact_id" });
    this.hasMany("agentsOfAgents", { through: "agents", source: "agents" });
    this.belongsTo("number1Fan", { className: "Person" });

    this.hasMany("personalLegacyThings", { dependent: "destroy" });

    this.hasMany("agentsPosts", { through: "agents", source: "posts" });
    this.hasMany("agentsPostsAuthors", { through: "agentsPosts", source: "author" });
    this.hasMany("essays", { primaryKey: "first_name", foreignKey: "writer_id" });

    this.scope("males", (q: any) => q.where({ gender: "M" }));

    this.attrReadonly("born_at");
  }
}

export class PersonWithDependentDestroyJobs extends Base {
  static {
    this._tableName = "people";
    this.hasMany("references", { foreignKey: "person_id" });
    this.hasMany("jobs", { source: "job", through: "references", dependent: "destroy" });
  }
}

export class PersonWithDependentDeleteAllJobs extends Base {
  static {
    this._tableName = "people";
    this.hasMany("references", { foreignKey: "person_id" });
    this.hasMany("jobs", { source: "job", through: "references", dependent: "delete" });
  }
}

export class PersonWithDependentNullifyJobs extends Base {
  static {
    this._tableName = "people";
    this.hasMany("references", { foreignKey: "person_id" });
    this.hasMany("jobs", { source: "job", through: "references", dependent: "nullify" });
  }
}

export class PersonWithPolymorphicDependentNullifyComments extends Base {
  static {
    this._tableName = "people";
    this.hasMany("comments", { as: "author", dependent: "nullify" });
  }
}

export class LoosePerson extends Base {
  static {
    this._tableName = "people";
    this.abstractClass = true;

    this.hasOne("bestFriend", { className: "LoosePerson", foreignKey: "best_friend_id" });
    this.belongsTo("bestFriendOf", { className: "LoosePerson", foreignKey: "best_friend_of_id" });
    this.hasMany("bestFriends", { className: "LoosePerson", foreignKey: "best_friend_id" });
  }
}
acceptsNestedAttributesFor(LoosePerson, "bestFriend");
acceptsNestedAttributesFor(LoosePerson, "bestFriendOf");
acceptsNestedAttributesFor(LoosePerson, "bestFriends");

export class LooseDescendant extends LoosePerson {}

export class TightPerson extends Base {
  static {
    this._tableName = "people";

    this.hasOne("bestFriend", { className: "TightPerson", foreignKey: "best_friend_id" });
    this.belongsTo("bestFriendOf", { className: "TightPerson", foreignKey: "best_friend_of_id" });
    this.hasMany("bestFriends", { className: "TightPerson", foreignKey: "best_friend_id" });
  }
}
acceptsNestedAttributesFor(TightPerson, "bestFriend");
acceptsNestedAttributesFor(TightPerson, "bestFriendOf");
acceptsNestedAttributesFor(TightPerson, "bestFriends");

export class TightDescendant extends TightPerson {}

export class RichPerson extends Base {
  static {
    this._tableName = "people";

    this.hasAndBelongsToMany("treasures", { joinTable: "peoples_treasures" });

    this.beforeValidation(async function (this: RichPerson) {
      if (this.isNewRecord()) await this.runBeforeCreate();
    });
    this.beforeValidation(async function (this: RichPerson) {
      await this.runBeforeValidation();
    });
  }

  /** @internal */
  private async runBeforeCreate() {
    this.writeAttribute(
      "first_name",
      (this.readAttribute("first_name") ?? "").toString() + "run_before_create",
    );
  }

  /** @internal */
  private async runBeforeValidation() {
    this.writeAttribute(
      "first_name",
      (this.readAttribute("first_name") ?? "").toString() + "run_before_validation",
    );
  }
}

export class NestedPerson extends Base {
  static {
    this._tableName = "people";

    this.hasOne("bestFriend", { className: "NestedPerson", foreignKey: "best_friend_id" });
  }

  set comments(_newComments: any) {
    throw new Error("RuntimeError");
  }

  set bestFriendFirstName(newName: string) {
    this.assignAttributes({ bestFriendAttributes: { first_name: newName } });
  }
}
acceptsNestedAttributesFor(NestedPerson, "bestFriend", { updateOnly: true });

export const Insure = {
  INSURES: ["life", "annuality"] as const,

  load(mask: any): string[] {
    return Insure.INSURES.filter((insure, i) => ((1 << i) & parseInt(mask, 10)) > 0);
  },

  dump(insures: string[]): number {
    return insures.reduce((sum, insure) => {
      const i = Insure.INSURES.indexOf(insure as any);
      return sum + (1 << i);
    }, 0);
  },
};

export class SerializedPerson extends Base {
  static {
    this._tableName = "people";
    this.serialize("insures", { coder: Insure });
  }
}
