import { ApplicationRecord } from "./application-record.ts";
import { LinkPreviewJob } from "../jobs/link-preview-job.ts";

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

export class Message extends ApplicationRecord {
  static {
    this.belongsTo("room", { touch: true });
    this.belongsTo("user");
    this.belongsTo("parent", {
      className: "Message",
      optional: true,
      counterCache: "replies_count",
    });
    this.hasMany("replies", {
      className: "Message",
      foreignKey: "parent_id",
      dependent: "destroy",
    });
    this.hasMany("reactions", { dependent: "destroy" });
    this.hasMany("linkPreviews", { dependent: "destroy" });
    this.hasManyAttached("attachments");

    this.validate(async function (this: Message) {
      if (!this.body?.trim() && !(await this.attachments.isAttached())) {
        this.errors.add("base", "Write a message or attach a file");
      }
    });

    this.scope("topLevel", function () {
      return this.where({ parent_id: null });
    });
    this.scope("chronological", function () {
      return this.order({ created_at: "asc", id: "asc" });
    });

    // New top-level messages stream into the room; replies stream into their thread
    // and re-render the parent so its reply count updates.
    this.afterCreateCommit(async function (this: Message) {
      const room = await this.room;
      if (this.parent_id == null) {
        await this.broadcastAppendTo(room, {
          target: "messages",
          partial: "messages/message",
          locals: { message: this },
        });
      } else {
        const parent = (await this.parent)!;
        await parent.reload();
        await this.broadcastAppendTo(parent, "thread", {
          target: `replies_${parent.id}`,
          partial: "messages/message",
          locals: { message: this },
        });
        await parent.broadcastReplaceTo(room, {
          partial: "messages/message",
          locals: { message: parent },
        });
      }
      if (this.urls().length > 0) await LinkPreviewJob.performLater(this);
    });

    this.afterDestroyCommit(async function (this: Message) {
      await this.broadcastRemoveTo(await this.room);
    });
  }

  urls(): string[] {
    return [...new Set(this.body?.match(URL_PATTERN) ?? [])].slice(0, 3);
  }

  isReply(): boolean {
    return this.parent_id != null;
  }

  /** Reactions grouped by emoji, in first-used order: `[["👍", [userId, ...]], ...]`. */
  async reactionGroups(): Promise<Array<[string, unknown[]]>> {
    const groups = new Map<string, unknown[]>();
    for (const r of (await this.reactions.order({ id: "asc" }).toArray()) as Array<{
      emoji: string;
      user_id: unknown;
    }>) {
      groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r.user_id]);
    }
    return [...groups];
  }

  /** Re-render this message wherever it is shown (room and, for a reply, its thread). */
  async broadcastRefreshEverywhere(): Promise<void> {
    const locals = { message: this };
    await this.broadcastReplaceTo(await this.room, { partial: "messages/message", locals });
    if (this.parent_id != null)
      await this.broadcastReplaceTo(await this.parent, "thread", {
        partial: "messages/message",
        locals,
      });
    else await this.broadcastReplaceTo(this, "thread", { partial: "messages/message", locals });
  }
}
