import { DescendantsTracker } from "@blazetrails/activesupport";
import type { Base } from "../../lib/base.js";
import type { ScopeOn } from "../../lib/scoping/named.js";
import type { Account } from "./account.js";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Topic, Web, WebTopic } from "./topic.js";

declare module "../../lib/relation.js" {
  interface RelationScopes<T extends Base> {
    open: ScopeOn<T, Account | Reply>;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Reply extends Topic {
  static {
    this.belongsTo("topic", {
      foreignKey: "parent_id",
      counterCache: true,
      inverseOf: "replies",
    });
    this.belongsTo("topicWithPrimaryKey", {
      className: "Topic",
      primaryKey: "title",
      foreignKey: "parent_title",
      counterCache: "replies_count",
      touch: true,
    });
    this.hasMany("replies", {
      className: "SillyReply",
      dependent: "destroy",
      foreignKey: "parent_id",
    });
    this.hasMany("sillyUniqueReplies", { dependent: "destroy", foreignKey: "parent_id" });

    this.scope("ordered", () => Reply.order("id"));

    this.aliasAttribute("new_content", "content");
    this.aliasAttribute("new_parent_id", "parent_id");
  }

  static open() {
    return this.approved();
  }
}
constSet(TopLevel, "Reply", Reply);
DescendantsTracker.registerSubclass(Topic, Reply);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Reply {
  get topic(): Topic | null | Promise<Topic | null>;
  set topic(value: Topic | null);
}

export class SillyReply extends Topic {
  static {
    this.belongsTo("reply", { foreignKey: "parent_id", counterCache: "replies_count" });
  }
}
constSet(TopLevel, "SillyReply", SillyReply);
DescendantsTracker.registerSubclass(Topic, SillyReply);

export class UniqueReply extends Reply {
  static {
    this.belongsTo("topic", { foreignKey: "parent_id", counterCache: true });
    this.validatesUniquenessOf("content", { scope: "parent_id" });
  }
}
constSet(TopLevel, "UniqueReply", UniqueReply);
DescendantsTracker.registerSubclass(Reply, UniqueReply);

export class SillyUniqueReply extends UniqueReply {
  static {
    this.validates("content", { uniqueness: true });
  }
}
constSet(TopLevel, "SillyUniqueReply", SillyUniqueReply);
DescendantsTracker.registerSubclass(UniqueReply, SillyUniqueReply);

export class WrongReply extends Reply {
  static {
    this.validate(":errorsOnEmptyContent");
    this.validate(":titleIsWrongCreate", { on: "create" });
    this.validate(":checkEmptyTitle");
    this.validate(":checkContentMismatch", { on: "create" });
    this.validate(":checkWrongUpdate", { on: "update" });
    this.validate(":checkAuthorNameIsSecret", { on: "specialCase" });
  }

  checkEmptyTitle() {
    if (!this.attributePresent("title")) {
      this.errors.add("title", "Empty");
    }
  }

  errorsOnEmptyContent() {
    if (!this.attributePresent("content")) {
      this.errors.add("content", "Empty");
    }
  }

  checkContentMismatch() {
    if (
      this.attributePresent("title") &&
      this.attributePresent("content") &&
      this.content === "Mismatch"
    ) {
      this.errors.add("title", "is Content Mismatch");
    }
  }

  titleIsWrongCreate() {
    if (this.attributePresent("title") && this.title === "Wrong Create") {
      this.errors.add("title", "is Wrong Create");
    }
  }

  checkWrongUpdate() {
    if (this.attributePresent("title") && this.title === "Wrong Update") {
      this.errors.add("title", "is Wrong Update");
    }
  }

  checkAuthorNameIsSecret() {
    if (this.author_name !== "secret") {
      this.errors.add("author_name", "Invalid");
    }
  }
}
constSet(TopLevel, "WrongReply", WrongReply);
DescendantsTracker.registerSubclass(Reply, WrongReply);

export class WebReply extends WebTopic {
  static {
    constSet(Web, "Reply", this);
    DescendantsTracker.registerSubclass(WebTopic, this);
  }
  static {
    this.belongsTo("topic", {
      foreignKey: "parent_id",
      counterCache: true,
      className: "Web::Topic",
    });
  }
}
