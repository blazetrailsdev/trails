import type { Job } from "./job.js";
import type { Person } from "./person.js";
// vendor/rails/activerecord/test/models/friendship.rb
import { Base } from "../../base.js";

export class Friendship extends Base {
  declare friend: Person | null;
  declare friendToo: Person | null;
  declare follower: Person | null;
  declare friendFavoriteReferenceJob: Job | null;
  declare followerFavoriteReferenceJob: Job | null;
  declare loadBelongsTo: ((name: "friend") => Promise<Person | null>) &
    ((name: "friendToo") => Promise<Person | null>) &
    ((name: "follower") => Promise<Person | null>);
  declare loadHasOne: ((name: "friendFavoriteReferenceJob") => Promise<Job | null>) &
    ((name: "followerFavoriteReferenceJob") => Promise<Job | null>);
  declare follower_id: number;
  declare friend_id: number;

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
