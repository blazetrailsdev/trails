// vendor/rails/activerecord/test/models/reader.rb
import { Base } from "../../base.js";

export class Reader extends Base {
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
  static {
    this._tableName = "readers";
    this.defaultScope((q: any) => q.where({ skimmer: true }));
    this.scope("skimmersOrNot", (q: any) => q.unscope({ where: "skimmer" }));
    this.belongsTo("post");
    this.belongsTo("person");
  }
}
