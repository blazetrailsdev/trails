import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Reply } from "./reply.js";
import type { SillyUniqueReply } from "./reply.js";
import type { UniqueReply } from "./reply.js";
import type { WebReply } from "./reply.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import type { TimeWithZone } from "@blazetrails/activesupport";
import { rbModConstSet, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- a generated attribute accessor's reader and writer types differ (CLAUDE.md, "Generated attribute readers are properties"); a class body cannot hold a bodiless accessor, so the pair lives in an interface that merges with the class. */
export interface Topic {
  get content(): unknown;
  set content(value: unknown);
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- the reader/writer accessor pair for this model's generated attributes lives in the interface merged above. */
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
  declare customApproved: unknown;
  declare author_email_address: string;
  declare author_name: string;
  declare binary_content: Uint8Array;
  declare bonus_time: (RubyTime | TimeWithZone) | null;
  declare created_at: (RubyTime | Temporal.PlainDateTime) | null;
  declare group: string;
  declare important: string;
  declare last_read: Temporal.PlainDate;
  declare parent_id: number;
  declare parent_title: string;
  declare replies_count: number | null;
  declare title: string | null;
  declare "type": string;
  declare unique_replies_count: number | null;
  declare updated_at: (RubyTime | Temporal.PlainDateTime) | null;
  declare written_on: RubyTime | Temporal.PlainDateTime;

  static {
    this.scope("base", function () {
      return this.all();
    });
    this.scope("writtenBefore", function (time: any) {
      if (time) {
        return this.where("written_on < ?", time);
      }
    });
    this.scope("approved", function () {
      return this.where({ approved: true });
    });
    this.scope("rejected", function () {
      return this.where({ approved: false });
    });
    this.scope("children", function () {
      return this.where().not({ parent_id: null });
    });
    this.scope("hasChildren", function (this: any) {
      return this.where({ id: this.model.children().select("parent_id") });
    });
    this.scope("byLifo", function () {
      return this.where({ author_name: "lifo" });
    });
    this.scope("replied", function () {
      return this.where("replies_count > 0");
    });
    this.scope("true", function () {
      return this.where({ approved: true });
    });
    this.scope("false", function () {
      return this.where({ approved: false });
    });
    this.scope("scopeWithLambda", function () {
      return this.all();
    });
    this.scope("approvedAsString", function () {
      return this.where({ approved: true });
    });
    this.scope(
      "anonymousExtension",
      function (this: any) {
        return this;
      },
      { one: () => 1 },
    );
    this.scope("scopeStats", function (this: any, stats: { count?: number }) {
      return this.count().then((c: number) => {
        stats.count = c;
        return this;
      });
    } as any);
    const klass = this;
    this.scope("withObject", {
      call() {
        return klass.where({ approved: true });
      },
    });
    this.scope("withKwargs", function (approved = false) {
      return this.where({ approved });
    });

    this.hasMany("replies", { dependent: "destroy", autosave: true, inverseOf: "topic" });
    this.hasMany(
      "approvedReplies",
      function () {
        return this.approved();
      },
      {
        className: "Reply",
        foreignKey: "parent_id",
        counterCache: "replies_count",
      },
    );
    this.hasMany(
      "openReplies",
      function (this: any) {
        return this.open();
      },
      {
        className: "Reply",
        foreignKey: "parent_id",
      },
    );
    this.hasMany("uniqueReplies", { dependent: "destroy", foreignKey: "parent_id" });
    this.hasMany("sillyUniqueReplies", { dependent: "destroy", foreignKey: "parent_id" });

    this.serialize("content");

    this.aliasAttribute("heading", "title");

    this.beforeCreate(async (record: Topic) => {
      await record.defaultWrittenOn();
    });
    this.beforeDestroy(async (record: Topic) => {
      await record.destroyChildren();
    });
    this.beforeValidation((record: Topic) => record.beforeValidationForTransaction());
    this.beforeSave((record: Topic) => record.beforeSaveForTransaction());
    this.beforeDestroy((record: Topic) => record.beforeDestroyForTransaction());
    this.afterSave((record: Topic) => record.afterSaveForTransaction());
    this.afterCreate((record: Topic) => record.afterCreateForTransaction());
    this.afterInitialize((record: Topic) => {
      record.setEmailAddress();
    });
  }

  changeApprovedBeforeSave: boolean | null | undefined;

  static {
    this.beforeSave((record: Topic) => record.changeApprovedCallback());
  }

  static afterInitializeCalled: boolean | null = null;

  static {
    this.afterInitialize(() => {
      Topic.afterInitializeCalled = true;
    });
  }

  declare afterTouchCalled: number;

  static {
    this.afterInitialize((record: Topic) => {
      record.afterTouchCalled = 0;
    });

    this.afterTouch(async (record: Topic) => {
      record.afterTouchCalled += 1;
    });
  }

  static async klassStats(this: typeof Topic, stats: { count?: number }): Promise<typeof Topic> {
    stats.count = await this.count();
    return this;
  }

  get approved(): boolean | null {
    return this.readAttribute("approved") as boolean | null;
  }

  set approved(val: boolean | null) {
    this.customApproved = val;
    this.writeAttribute("approved", val);
  }

  static nestedScoping(scope: any): Relation<Topic> {
    return scope.base();
  }

  async parent() {
    return Topic.find(this.readAttribute("parent_id") as number);
  }

  topicId() {
    return this.id;
  }

  /** @internal */
  private async defaultWrittenOn() {
    if (!this.attributePresent("written_on")) {
      this.writeAttribute("written_on", RubyTime.now());
    }
  }

  /** @internal */
  private async destroyChildren() {
    await Topic.deleteBy({ parent_id: this.id });
  }

  /** @internal */
  private setEmailAddress() {
    if (!this.isPersisted() && !this.isWillSaveChangeToAttribute("author_email_address")) {
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

  /** @internal */
  private changeApprovedCallback() {
    if (this.changeApprovedBeforeSave != null) {
      this.approved = this.changeApprovedBeforeSave;
    }
  }
}
registerModel(Topic);

export class DefaultRejectedTopic extends Topic {
  static {
    this.defaultScope(function () {
      return this.where({ approved: false });
    });
  }
}
registerModel(DefaultRejectedTopic);

export class BlankTopic extends Topic {
  blank() {
    return true;
  }
}
registerModel(BlankTopic);

export class TitlePrimaryKeyTopic extends Topic {
  static {
    this.primaryKey = "title";
    this.aliasAttribute("id_value", "id");
  }
}
registerModel(TitlePrimaryKeyTopic);

export const Web = {};
registerConstant("Web", Web);

export class WebTopic extends Base {
  declare replies: AssociationProxy<WebReply>;

  static _tableName = "topics";

  static {
    registerModel(rbModConstSet(Web, "Topic", this));
    this.hasMany("replies", {
      dependent: "destroy",
      foreignKey: "parent_id",
      className: "Web::Reply",
    });
  }
}
