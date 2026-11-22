import { ApplicationRecord } from "./application-record.ts";
import type { User } from "./user.ts";
import { NotifyFollowersJob } from "../jobs/notify-followers-job.ts";
export class Post extends ApplicationRecord {
  declare title: string;
  declare author: Promise<User>;
  static {
    this.belongsTo("author", { className: "User" });
    this.hasMany("comments", { dependent: "destroy" });
    this.hasOneAttached("coverImage");
    this.hasRichText("body");
    this.encrypts("draftNotes");
    this.validates("title", { presence: true });
    this.scope("published", function () {
      return this.where({ status: "published" });
    });
    this.broadcastsTo("author");
    this.afterCreateCommit(function (this: Post) {
      return NotifyFollowersJob.performLater(this);
    });
  }
}
