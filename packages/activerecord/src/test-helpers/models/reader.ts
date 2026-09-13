import type { Relation } from "../../relation.js";
import type { FirstPost } from "./post.js";
import type { Person } from "./person.js";
import type { Post } from "./post.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Reader extends Base {
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
    this.belongsTo("firstPost", (q: any) => q.where({ id: [2, 3] }));
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Reader {
  get post(): Post | null | Promise<Post | null>;
  set post(value: Post | null);
  get person(): Person | null | Promise<Person | null>;
  set person(value: Person | null);
  get singlePerson(): Person | null | Promise<Person | null>;
  set singlePerson(value: Person | null);
  get firstPost(): FirstPost | null | Promise<FirstPost | null>;
  set firstPost(value: FirstPost | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SecureReader extends Base {
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface SecureReader {
  get securePost(): Post | null | Promise<Post | null>;
  set securePost(value: Post | null);
  get securePerson(): Person | null | Promise<Person | null>;
  set securePerson(value: Person | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LazyReader extends Base {
  declare static skimmersOrNot: () => Relation<LazyReader>;

  static {
    this._tableName = "readers";
    this.defaultScope((q: any) => q.where({ skimmer: true }));
    this.scope("skimmersOrNot", function (this: any) {
      return this.unscope({ where: "skimmer" });
    });
    this.belongsTo("post");
    this.belongsTo("person");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface LazyReader {
  get post(): Post | null | Promise<Post | null>;
  set post(value: Post | null);
  get person(): Person | null | Promise<Person | null>;
  set person(value: Person | null);
}

registerModel(Reader);
