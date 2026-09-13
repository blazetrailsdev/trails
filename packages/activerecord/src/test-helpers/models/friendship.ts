import type { Job } from "./job.js";
import type { Person } from "./person.js";
import { Base } from "../../base.js";

export class Friendship extends Base {
  declare friend: Person | null | Promise<Person | null>;
  declare friendToo: Person | null | Promise<Person | null>;
  declare follower: Person | null | Promise<Person | null>;
  declare friendFavoriteReferenceJob: Job | null | Promise<Job | null>;
  declare followerFavoriteReferenceJob: Job | null | Promise<Job | null>;
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
