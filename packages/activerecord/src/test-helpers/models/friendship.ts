// vendor/rails/activerecord/test/models/friendship.rb
import { Base } from "../../base.js";

export class Friendship extends Base {
  static {
    this.belongsTo("friend", { className: "Person" });
    this.belongsTo("friendToo", {
      foreignKey: "friend_id",
      className: "Person",
      counterCache: "friends_too_count",
    });
    this.belongsTo("follower", { className: "Person" });

    this.hasOne("friendFavoriteReferenceJob", {
      through: "friend",
      source: "favoriteReferenceJob",
    });
    this.hasOne("followerFavoriteReferenceJob", {
      through: "follower",
      source: "favoriteReferenceJob",
    });
  }
}
