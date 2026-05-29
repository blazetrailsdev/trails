import { Base, Relation } from "@blazetrails/activerecord";

export class Tweet extends Base {
  static {
    this.belongsTo("author", { className: "User", foreignKey: "user_id" });
    this.hasMany("likes", { dependent: "destroy" });

    this.validates("body", { presence: true, length: { maximum: 280 } });

    this.scope("recent", (rel: Relation<Tweet>) => rel.order("created_at", "desc"));
  }
}
