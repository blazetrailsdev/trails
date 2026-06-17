import type { Relation } from "../../relation.js";
import type { FirstPost } from "./post.js";
import type { Person } from "./person.js";
import type { Post } from "./post.js";
// vendor/rails/activerecord/test/models/reader.rb
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Reader extends Base {
  declare post: Post | null;
  declare person: Person | null;
  declare singlePerson: Person | null;
  declare firstPost: FirstPost | null;
  declare loadBelongsTo: ((name: "post") => Promise<Post | null>) &
    ((name: "person") => Promise<Person | null>) &
    ((name: "singlePerson") => Promise<Person | null>) &
    ((name: "firstPost") => Promise<FirstPost | null>);
  declare first_post_id: number;
  declare person_id: number;
  declare post_id: number;
  declare skimmer: boolean | null;

  static {
    this.belongsTo("post");
    this.belongsTo("person", { inverseOf: "readers" });
    this.belongsTo("singlePerson", {
      className: "Person",
      foreignKey: "person_id",
      inverseOf: "reader",
    });
    this.belongsTo("firstPost", { scope: (q: any) => q.where({ id: [2, 3] }) });
  }
}

export class SecureReader extends Base {
  declare securePost: Post | null;
  declare securePerson: Person | null;
  declare loadBelongsTo: ((name: "securePost") => Promise<Post | null>) &
    ((name: "securePerson") => Promise<Person | null>);

  static {
    this._tableName = "readers";
    this.belongsTo("securePost", { className: "Post", foreignKey: "post_id" });
    this.belongsTo("securePerson", {
      inverseOf: "secureReaders",
      className: "Person",
      foreignKey: "person_id",
    });
  }
}

export class LazyReader extends Base {
  declare static skimmersOrNot: () => Relation<LazyReader>;
  declare post: Post | null;
  declare person: Person | null;
  declare loadBelongsTo: ((name: "post") => Promise<Post | null>) &
    ((name: "person") => Promise<Person | null>);

  static {
    this._tableName = "readers";
    this.defaultScope((q: any) => q.where({ skimmer: true }));
    this.scope("skimmersOrNot", (q: any) => q.unscope({ where: "skimmer" }));
    this.belongsTo("post");
    this.belongsTo("person");
  }
}

registerModel(Reader);
