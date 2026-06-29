import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Reply } from "./reply.js";
import type { SillyUniqueReply } from "./reply.js";
import type { UniqueReply } from "./reply.js";
import type { WebReply } from "./reply.js";
// vendor/rails/activerecord/test/models/topic.rb
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "../../base.js";
import { registerSubclass } from "../../inheritance.js";

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
  declare static scopeStats: (stats: { count?: number }) => Promise<Relation<Topic>>;
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
    this.scope("anonymousExtension", (q: any) => q, { one: () => 1 });
    // Rails topic.rb: `scope :scope_stats, -> stats { stats[:count] = count; self }`.
    // The scope body mutates the passed stats hash with the relation's count and
    // returns the relation (`self`). trails relations count asynchronously, so the
    // body is async — the lone faithful divergence from Rails' sync `count`.
    this.scope("scopeStats", ((q: any, stats: { count?: number }) =>
      q.count().then((c: number) => {
        stats.count = c;
        return q;
      })) as any);
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
    // Deferred rather than run inline: the cancellation test installs a
    // `before_validation_for_transaction` that performs a DB write then
    // `throw :abort`. Rails runs it inside the save transaction so the write
    // rolls back, but trails' validation chain is strict-sync (can't await an
    // async DB call). Enqueuing the thunk lets `save` await it inside the
    // transaction. The default no-op hook is a harmless enqueued no-op.
    this.beforeValidation((record: Topic) => {
      ((record as any)._beforeValidationSideEffects ??= []).push(() =>
        (record as any).beforeValidationForTransaction(),
      );
    });
    // Returned so the async save-callback chain awaits the hook: a cancelling
    // `before_save` that performs a DB side effect then `throw :abort` must run
    // inside the save transaction so the write rolls back with it
    // (transactions_test.rb:714). The default no-op returns undefined (sync).
    this.beforeSave((record: Topic) => (record as any).beforeSaveForTransaction());
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
    // class_attribute :after_initialize_called (topic.rb:84-89).
    this.afterInitialize(() => {
      Topic.afterInitializeCalled = true;
    });
    this.afterTouch(async (record: any) => {
      record.afterTouchCalled = (record.afterTouchCalled ?? 0) + 1;
    });
  }

  afterTouchCalled = 0;

  static afterInitializeCalled: boolean | null = null;

  // Rails topic.rb: `def self.klass_stats(stats); stats[:count] = count; self; end`.
  // Like `scope_stats` but a plain class method; `count` honors the current scope
  // installed when called on a relation (`Topic.all.klass_stats(stats)`). Async
  // because trails counts asynchronously.
  static async klassStats(this: typeof Topic, stats: { count?: number }): Promise<typeof Topic> {
    stats.count = (await this.count()) as number;
    return this;
  }

  // Rails topic.rb: `def self.nested_scoping(scope); scope.base; end`.
  static nestedScoping(scope: any): Relation<Topic> {
    return scope.base();
  }

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

// Track the STI subtree on the `topics` table so registry-safe row-path
// resolution finds these through Topic's own subtree. Reply and its descendants
// register themselves from reply.ts.
for (const klass of [DefaultRejectedTopic, BlankTopic, TitlePrimaryKeyTopic]) {
  registerSubclass(klass);
}
