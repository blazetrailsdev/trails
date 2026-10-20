import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Topic, Web, WebTopic } from "./topic.js";
import { registerModel } from "../../associations.js";

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
registerModel(Reply);
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
registerModel(SillyReply);

export class UniqueReply extends Reply {
  static {
    this.belongsTo("topic", { foreignKey: "parent_id", counterCache: true });
    this.validatesUniquenessOf("content", { scope: "parent_id" });
  }
}
registerModel(UniqueReply);

export class SillyUniqueReply extends UniqueReply {
  static {
    this.validates("content", { uniqueness: true });
  }
}
registerModel(SillyUniqueReply);

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
registerModel(WrongReply);

export class WebReply extends WebTopic {
  static {
    registerModel(rbModConstSet(Web, "Reply", this));
  }
  static {
    this.belongsTo("topic", {
      foreignKey: "parent_id",
      counterCache: true,
      className: "Web::Topic",
    });
  }
}
