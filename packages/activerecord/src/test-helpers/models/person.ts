import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { Author } from "./author.js";
import type { BadReference } from "./reference.js";
import type { Comment } from "./comment.js";
import type { Essay } from "./essay.js";
import type { FirstPost } from "./post.js";
import type { Friendship } from "./friendship.js";
import type { Job } from "./job.js";
import type { PersonalLegacyThing } from "./personal-legacy-thing.js";
import type { Post } from "./post.js";
import type { Reader } from "./reader.js";
import type { Reference } from "./reference.js";
import type { SecureReader } from "./reader.js";
import type { Treasure } from "./treasure.js";
import { acceptsNestedAttributesFor } from "../../nested-attributes.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";
import type { CollectionProxy } from "../../associations/collection-proxy.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Person {
  get first_name(): string;
  set first_name(value: unknown);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Person extends Base {
  declare readers: AssociationProxy<Reader>;
  declare secureReaders: AssociationProxy<SecureReader>;
  declare posts: AssociationProxy<Post>;
  declare securePosts: AssociationProxy<Post>;
  declare postsWithNoComments: AssociationProxy<Post>;
  declare friendships: AssociationProxy<Friendship>;
  declare friendsToo: AssociationProxy<Friendship>;
  declare references: AssociationProxy<Reference>;
  declare badReferences: AssociationProxy<BadReference>;
  declare fixedBadReferences: AssociationProxy<BadReference>;
  declare postsWithCommentsSortedByCommentId: AssociationProxy<Post>;
  declare firstPosts: AssociationProxy<FirstPost>;
  declare jobs: AssociationProxy<Job>;
  declare jobsWithDependentDestroy: AssociationProxy<Job>;
  declare jobsWithDependentDeleteAll: AssociationProxy<Job>;
  declare jobsWithDependentNullify: AssociationProxy<Job>;
  declare agents: AssociationProxy<Person>;
  declare agentsOfAgents: AssociationProxy<Person>;
  declare personalLegacyThings: AssociationProxy<PersonalLegacyThing>;
  declare agentsPosts: AssociationProxy<Post>;
  declare agentsPostsAuthors: AssociationProxy<Author>;
  declare essays: AssociationProxy<Essay>;
  declare static males: () => Relation<Person>;
  declare best_friend_id: number;
  declare best_friend_of_id: number;
  declare born_at: RubyTime | Temporal.PlainDateTime;
  declare cars_count: number | null;
  declare comments: string;
  declare created_at: RubyTime | Temporal.PlainDateTime;
  declare followers_count: number | null;
  declare friends_too_count: number | null;
  declare gender: string | null;
  declare insures: number;
  declare lock_version: number;
  declare number1_fan_id: number;
  declare primary_contact_id: number;
  declare updated_at: RubyTime | Temporal.PlainDateTime;

  declare followers: CollectionProxy<Person>;

  static {
    this.hasMany("readers");
    this.hasMany("secureReaders");
    this.hasOne("reader");

    this.hasMany("posts", { through: "readers" });
    this.hasMany("securePosts", { through: "secureReaders" });
    this.hasMany(
      "postsWithNoComments",
      function (this: any) {
        return this.includes(":comments").where("comments.id is null").references(":comments");
      },
      { through: "readers", source: "post" },
    );

    this.hasMany("friendships", { foreignKey: "friend_id" });
    this.hasMany("friendsToo", { foreignKey: "friend_id", className: "Friendship" });
    this.hasMany("followers", { through: "friendships" });

    this.hasMany("references");
    this.hasMany("badReferences");
    this.hasMany(
      "fixedBadReferences",
      function (this: any) {
        return this.where({ favorite: true });
      },
      {
        className: "BadReference",
      },
    );
    this.hasOne(
      "favoriteReference",
      function (this: any) {
        return this.where({ favorite: true });
      },
      {
        className: "Reference",
      },
    );
    this.hasOne("favoriteReferenceJob", { through: "favoriteReference", source: "job" });
    this.hasMany(
      "postsWithCommentsSortedByCommentId",
      function (this: any) {
        return this.includes(":comments").order("comments.id");
      },
      { through: "readers", source: "post" },
    );
    this.hasMany(
      "firstPosts",
      function (this: any) {
        return this.where({ id: [1, 2] });
      },
      { through: "readers" },
    );

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

    this.scope("males", function (this: any) {
      return this.where({ gender: "M" });
    });

    this.attrReadonly("born_at");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Person {
  get reader(): Reader | null | Promise<Reader | null>;
  set reader(value: Reader | null);
  get favoriteReference(): Reference | null | Promise<Reference | null>;
  set favoriteReference(value: Reference | null);
  get favoriteReferenceJob(): Job | null | Promise<Job | null>;
  set favoriteReferenceJob(value: Job | null);
  get primaryContact(): Person | null | Promise<Person | null>;
  set primaryContact(value: Person | null);
  get number1Fan(): Person | null | Promise<Person | null>;
  set number1Fan(value: Person | null);
}

export class PersonWithDependentDestroyJobs extends Base {
  declare references: AssociationProxy<Reference>;
  declare jobs: AssociationProxy<Job>;

  static {
    this._tableName = "people";
    this.hasMany("references", { foreignKey: "person_id" });
    this.hasMany("jobs", { source: "job", through: "references", dependent: "destroy" });
  }
}

export class PersonWithDependentDeleteAllJobs extends Base {
  declare references: AssociationProxy<Reference>;
  declare jobs: AssociationProxy<Job>;

  static {
    this._tableName = "people";
    this.hasMany("references", { foreignKey: "person_id" });
    this.hasMany("jobs", { source: "job", through: "references", dependent: "delete" });
  }
}

export class PersonWithDependentNullifyJobs extends Base {
  declare references: AssociationProxy<Reference>;
  declare jobs: AssociationProxy<Job>;

  static {
    this._tableName = "people";
    this.hasMany("references", { foreignKey: "person_id" });
    this.hasMany("jobs", { source: "job", through: "references", dependent: "nullify" });
  }
}

export class PersonWithPolymorphicDependentNullifyComments extends Base {
  declare comments: AssociationProxy<Comment>;

  static {
    this._tableName = "people";
    this.hasMany("comments", { as: "author", dependent: "nullify" });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LoosePerson extends Base {
  declare bestFriends: AssociationProxy<LoosePerson>;

  static {
    this._tableName = "people";
    this.abstractClass = true;

    this.hasOne("bestFriend", { className: "LoosePerson", foreignKey: "best_friend_id" });
    this.belongsTo("bestFriendOf", { className: "LoosePerson", foreignKey: "best_friend_of_id" });
    this.hasMany("bestFriends", { className: "LoosePerson", foreignKey: "best_friend_id" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface LoosePerson {
  get bestFriend(): LoosePerson | null | Promise<LoosePerson | null>;
  set bestFriend(value: LoosePerson | null);
  get bestFriendOf(): LoosePerson | null | Promise<LoosePerson | null>;
  set bestFriendOf(value: LoosePerson | null);
}
acceptsNestedAttributesFor(LoosePerson, "bestFriend");
acceptsNestedAttributesFor(LoosePerson, "bestFriendOf");
acceptsNestedAttributesFor(LoosePerson, "bestFriends");

export class LooseDescendant extends LoosePerson {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TightPerson extends Base {
  declare bestFriends: AssociationProxy<TightPerson>;

  static {
    this._tableName = "people";

    this.hasOne("bestFriend", { className: "TightPerson", foreignKey: "best_friend_id" });
    this.belongsTo("bestFriendOf", { className: "TightPerson", foreignKey: "best_friend_of_id" });
    this.hasMany("bestFriends", { className: "TightPerson", foreignKey: "best_friend_id" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface TightPerson {
  get bestFriend(): TightPerson | null | Promise<TightPerson | null>;
  set bestFriend(value: TightPerson | null);
  get bestFriendOf(): TightPerson | null | Promise<TightPerson | null>;
  set bestFriendOf(value: TightPerson | null);
}
acceptsNestedAttributesFor(TightPerson, "bestFriend");
acceptsNestedAttributesFor(TightPerson, "bestFriendOf");
acceptsNestedAttributesFor(TightPerson, "bestFriends");

export class TightDescendant extends TightPerson {}

export class RichPerson extends Base {
  declare treasures: AssociationProxy<Treasure>;

  static {
    this._tableName = "people";

    this.hasAndBelongsToMany("treasures", { joinTable: "peoples_treasures" });

    this.beforeValidation((record: RichPerson) => record.runBeforeCreate(), { on: "create" });
    this.beforeValidation((record: RichPerson) => record.runBeforeValidation());
  }

  /** @internal */
  runBeforeCreate() {
    this.writeAttribute(
      "first_name",
      (this.readAttribute("first_name") ?? "").toString() + "run_before_create",
    );
  }

  /** @internal */
  runBeforeValidation() {
    this.writeAttribute(
      "first_name",
      (this.readAttribute("first_name") ?? "").toString() + "run_before_validation",
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class NestedPerson extends Base {
  static {
    this._tableName = "people";

    this.hasOne("bestFriend", { className: "NestedPerson", foreignKey: "best_friend_id" });
  }

  set comments(_newComments: any) {
    throw new Error("RuntimeError");
  }

  setBestFriendFirstName(newName: string): Promise<void> | void {
    return this.assignAttributes({ bestFriendAttributes: { first_name: newName } });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface NestedPerson {
  get bestFriend(): NestedPerson | null | Promise<NestedPerson | null>;
  set bestFriend(value: NestedPerson | null);
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

registerModel(Person);

export class PersonWithTimestampInCreate extends Base {
  declare born_at: RubyTime | Temporal.PlainDateTime | null;

  static {
    this._tableName = "people";
    this.beforeCreate(function (this: PersonWithTimestampInCreate) {
      (this as any).born_at = (this as any).created_at;
    });
  }
}

export class PersonWithTimestampInUpdate extends Base {
  declare born_at: RubyTime | Temporal.PlainDateTime | null;

  static {
    this._tableName = "people";
    this.beforeUpdate(function (this: PersonWithTimestampInUpdate) {
      (this as any).born_at = (this as any).created_at;
    });
  }
}

export class PersonWithTimestampInSave extends Base {
  declare born_at: RubyTime | Temporal.PlainDateTime | null;

  static {
    this._tableName = "people";
    this.beforeCreate(function (this: PersonWithTimestampInSave) {
      (this as any).born_at = (this as any).created_at;
    });
  }
}
