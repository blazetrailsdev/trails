// vendor/rails/activerecord/test/models/topic.rb
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Base } from "../../base.js";

export class Topic extends Base {
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

    this.aliasAttribute("heading", "title");

    this.beforeCreate(async function (this: Topic) {
      await this.defaultWrittenOn();
    });
    this.beforeDestroy(async function (this: Topic) {
      await this.destroyChildren();
    });
    this.beforeValidation(async function (this: Topic) {
      await this.beforeValidationForTransaction();
    });
    this.beforeSave(async function (this: Topic) {
      await this.beforeSaveForTransaction();
    });
    this.beforeDestroy(async function (this: Topic) {
      await this.beforeDestroyForTransaction();
    });
    this.afterSave(async function (this: Topic) {
      await this.afterSaveForTransaction();
    });
    this.afterCreate(async function (this: Topic) {
      await this.afterCreateForTransaction();
    });
    this.afterInitialize((record: Topic) => {
      (record as any).setEmailAddress();
    });
    this.afterTouch(async function (this: any) {
      this.afterTouchCalled = (this.afterTouchCalled ?? 0) + 1;
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
  private async beforeValidationForTransaction() {}
  /** @internal */
  private async beforeSaveForTransaction() {}
  /** @internal */
  private async beforeDestroyForTransaction() {}
  /** @internal */
  private async afterSaveForTransaction() {}
  /** @internal */
  private async afterCreateForTransaction() {}
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
  static _tableName = "topics";

  static {
    this.hasMany("replies", {
      dependent: "destroy",
      foreignKey: "parent_id",
      className: "WebReply",
    });
  }
}
