import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Reply } from "./reply.js";
import type { SillyUniqueReply } from "./reply.js";
import type { UniqueReply } from "./reply.js";
import type { WebReply } from "./reply.js";
// vendor/rails/activerecord/test/models/topic.rb
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "../../base.js";

export class Topic extends Base {
  declare static base: () => Relation<Topic>;
  declare static writtenBefore: (time: any) => Relation<Topic>;
  declare static approved: () => Relation<Topic>;
  declare static rejected: () => Relation<Topic>;
  declare static children: () => Relation<Topic>;
  declare static hasChildren: () => Relation<Topic>;
  declare static byLifo: () => Relation<Topic>;
  declare static replied: () => Relation<Topic>;
  declare static true: () => Relation<Topic>;
  declare static false: () => Relation<Topic>;
  declare static scopeWithLambda: () => Relation<Topic>;
  declare static approvedAsString: () => Relation<Topic>;
  declare static anonymousExtension: () => Relation<Topic>;
  declare static scopeStats: () => Relation<Topic>;
  declare static withObject: () => Relation<Topic>;
  declare static withKwargs: (approved?: boolean) => Relation<Topic>;
  declare replies: AssociationProxy<Reply>;
  declare approvedReplies: AssociationProxy<Reply>;
  declare openReplies: AssociationProxy<Reply>;
  declare uniqueReplies: AssociationProxy<UniqueReply>;
  declare sillyUniqueReplies: AssociationProxy<SillyUniqueReply>;
  declare approved: boolean | null;
  declare author_email_address: string;
  declare author_name: string;
  declare binary_content: Uint8Array;
  declare bonus_time: Temporal.PlainTime;
  declare content: string;
  declare created_at: (Temporal.Instant | Temporal.PlainDateTime) | null;
  declare group: string;
  declare important: string;
  declare last_read: Temporal.PlainDate;
  declare parent_id: number;
  declare parent_title: string;
  declare replies_count: number | null;
  declare title: string | null;
  declare "type": string;
  declare unique_replies_count: number | null;
  declare updated_at: (Temporal.Instant | Temporal.PlainDateTime) | null;
  declare written_on: Temporal.Instant | Temporal.PlainDateTime;

  static {
    this.scope("base", (q: any) => q.all());
    this.scope("writtenBefore", (q: any, time: any) =>
      time ? q.where("written_on < ?", time) : q,
    );
    this.scope("approved", (q: any) => q.where({ approved: true }));
    this.scope("rejected", (q: any) => q.where({ approved: false }));
    this.scope("children", (q: any) => q.whereNot({ parent_id: null }));
    this.scope("hasChildren", (q: any) =>
      q.where({ id: q._modelClass.children().select("parent_id") }),
    );
    this.scope("byLifo", (q: any) => q.where({ author_name: "lifo" }));
    this.scope("replied", (q: any) => q.where("replies_count > 0"));
    // "true"/"false" are reserved words; call via bracket notation: Topic["true"]()
    this.scope("true", (q: any) => q.where({ approved: true }));
    this.scope("false", (q: any) => q.where({ approved: false }));
    this.scope("scopeWithLambda", (q: any) => q.all());
    this.scope("approvedAsString", (q: any) => q.where({ approved: true }));
    this.scope("anonymousExtension", (q: any) => q);
    this.scope("scopeStats", (q: any) => q);
    this.scope("withObject", (q: any) => q.where({ approved: true }));
    this.scope("withKwargs", (q: any, approved = false) => q.where({ approved }));

    this.hasMany("replies", { dependent: "destroy", autosave: true, inverseOf: "topic" });
    this.hasMany("approvedReplies", {
      className: "Reply",
      foreignKey: "parent_id",
      counterCache: "replies_count",
    });
    this.hasMany("openReplies", { className: "Reply", foreignKey: "parent_id" });
    this.hasMany("uniqueReplies", { dependent: "destroy", foreignKey: "parent_id" });
    this.hasMany("sillyUniqueReplies", { dependent: "destroy", foreignKey: "parent_id" });

    this.serialize("content");

    this.aliasAttribute("heading", "title");

    this.beforeCreate(async (record: Topic) => {
      await (record as any).defaultWrittenOn();
    });
    this.beforeDestroy(async (record: Topic) => {
      await (record as any).destroyChildren();
    });
    // Rails registers these as plain synchronous method hooks
    // (`before_validation :before_validation_for_transaction`, etc. —
    // all `def ...; end`). They MUST stay sync: `before_validation` runs on
    // the strict-sync validation chain (ActiveModel `valid?`), which rejects
    // a Promise-returning callback. The record arrives as the callback arg
    // (not `this`), matching the `afterInitialize`/`setEmailAddress` hook below.
    this.beforeValidation((record: Topic) => {
      (record as any).beforeValidationForTransaction();
    });
    this.beforeSave((record: Topic) => {
      (record as any).beforeSaveForTransaction();
    });
    this.beforeDestroy((record: Topic) => {
      (record as any).beforeDestroyForTransaction();
    });
    this.afterSave((record: Topic) => {
      (record as any).afterSaveForTransaction();
    });
    this.afterCreate((record: Topic) => {
      (record as any).afterCreateForTransaction();
    });
    this.afterInitialize((record: Topic) => {
      (record as any).setEmailAddress();
    });
    this.afterTouch(async (record: any) => {
      record.afterTouchCalled = (record.afterTouchCalled ?? 0) + 1;
    });
  }

  afterTouchCalled = 0;

  async parent() {
    return Topic.find(this.readAttribute("parent_id") as number);
  }

  topicId() {
    return (this as any).id;
  }

  /** @internal */
  private async defaultWrittenOn() {
    if (!(this as any).attributePresent("written_on")) {
      this.writeAttribute("written_on", Temporal.Now.instant());
    }
  }

  /** @internal */
  private async destroyChildren() {
    await Topic.deleteBy({ parent_id: (this as any).id });
  }

  /** @internal */
  private setEmailAddress() {
    if (!this.isPersisted() && !this.willSaveChangeToAttribute("author_email_address")) {
      this.writeAttribute("author_email_address", "test@test.com");
    }
  }

  /** @internal */
  private beforeValidationForTransaction() {}
  /** @internal */
  private beforeSaveForTransaction() {}
  /** @internal */
  private beforeDestroyForTransaction() {}
  /** @internal */
  private afterSaveForTransaction() {}
  /** @internal */
  private afterCreateForTransaction() {}
}

export class DefaultRejectedTopic extends Topic {
  static {
    this.defaultScope((q: any) => q.where({ approved: false }));
  }
}

export class BlankTopic extends Topic {
  blank() {
    return true;
  }
}

export class TitlePrimaryKeyTopic extends Topic {
  static {
    this._primaryKey = "title";
    this.aliasAttribute("idValue", "id");
  }
}

export class WebTopic extends Base {
  declare replies: AssociationProxy<WebReply>;

  static _tableName = "topics";

  static {
    this.hasMany("replies", {
      dependent: "destroy",
      foreignKey: "parent_id",
      className: "WebReply",
    });
  }
}
