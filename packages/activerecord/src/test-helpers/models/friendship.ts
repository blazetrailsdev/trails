import type { Job } from "./job.js";
import type { Person } from "./person.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Friendship extends Base {
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Friendship {
  get friend(): Person | null | Promise<Person | null>;
  set friend(value: Person | null);
  get friendToo(): Person | null | Promise<Person | null>;
  set friendToo(value: Person | null);
  get follower(): Person | null | Promise<Person | null>;
  set follower(value: Person | null);
  get friendFavoriteReferenceJob(): Job | null | Promise<Job | null>;
  set friendFavoriteReferenceJob(value: Job | null);
  get followerFavoriteReferenceJob(): Job | null | Promise<Job | null>;
  set followerFavoriteReferenceJob(value: Job | null);
}
