// vendor/rails/activerecord/test/models/reply.rb
import { Topic, WebTopic } from "./topic.js";

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

    this.scope("ordered", (q: any) => q.order("id"));

    this.aliasAttribute("newContent", "content");
    this.aliasAttribute("newParentId", "parent_id");
  }

  static open() {
    return (this as any).approved();
  }
}

export class SillyReply extends Topic {
  static {
    this.belongsTo("reply", { foreignKey: "parent_id", counterCache: "replies_count" });
  }
}

export class UniqueReply extends Reply {
  static {
    this.belongsTo("topic", { foreignKey: "parent_id", counterCache: true });
    this.validatesUniqueness("content", { scope: "parent_id" });
  }
}

export class SillyUniqueReply extends UniqueReply {
  static {
    this.validates("content", { uniqueness: true });
  }
}

export class WrongReply extends Reply {
  static {
    this.validate("errorsOnEmptyContent");
    this.validate("titleIsWrongCreate", { on: "create" });
    this.validate("checkEmptyTitle");
    this.validate("checkContentMismatch", { on: "create" });
    this.validate("checkWrongUpdate", { on: "update" });
    this.validate("checkAuthorNameIsSecret", { on: "specialCase" });
  }

  checkEmptyTitle() {
    if (!(this as any).attributePresent("title")) {
      (this as any).errors.add("title", "Empty");
    }
  }

  errorsOnEmptyContent() {
    if (!(this as any).attributePresent("content")) {
      (this as any).errors.add("content", "Empty");
    }
  }

  checkContentMismatch() {
    if (
      (this as any).attributePresent("title") &&
      (this as any).attributePresent("content") &&
      (this as any).content === "Mismatch"
    ) {
      (this as any).errors.add("title", "is Content Mismatch");
    }
  }

  titleIsWrongCreate() {
    if ((this as any).attributePresent("title") && (this as any).title === "Wrong Create") {
      (this as any).errors.add("title", "is Wrong Create");
    }
  }

  checkWrongUpdate() {
    if ((this as any).attributePresent("title") && (this as any).title === "Wrong Update") {
      (this as any).errors.add("title", "is Wrong Update");
    }
  }

  checkAuthorNameIsSecret() {
    if ((this as any).author_name !== "secret") {
      (this as any).errors.add("author_name", "Invalid");
    }
  }
}

export class WebReply extends WebTopic {
  static {
    this.belongsTo("topic", { foreignKey: "parent_id", counterCache: true, className: "WebTopic" });
  }
}
