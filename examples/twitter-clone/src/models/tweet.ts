import { Base, Relation, type ScopeMethod, type ScopeOn } from "@blazetrails/activerecord";

export class Tweet extends Base {
  declare static recent: ScopeMethod<Tweet>;

  static {
    this.belongsTo("author", { className: "User", foreignKey: "user_id" });
    this.hasMany("likes", { dependent: "destroy" });

    this.validates("body", { presence: true, length: { maximum: 280 } });

    this.scope("recent", function (this: Relation<Tweet>) {
      return this.order("created_at", "desc");
    });
  }
}

declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends Base> {
    recent: ScopeOn<T, Tweet>;
  }
}
