// vendor/rails/activerecord/test/models/content.rb
import { Base } from "../../base.js";

export class Content extends Base {
  static _tableName = "content";

  static destroyedIds: number[] = [];

  static {
    this.hasOne("contentPosition", { dependent: "destroy" });
    this.beforeDestroy(function (this: Content) {
      Content.destroyedIds.push(this.id as number);
    });
  }
}

export class ContentWhichRequiresTwoDestroyCalls extends Base {
  static _tableName = "content";

  private destroyCount: number = 0;

  static {
    this.hasOne("contentPosition", { foreignKey: "content_id", dependent: "destroy" });
    this.afterInitialize(function (this: ContentWhichRequiresTwoDestroyCalls) {
      this.destroyCount = 0;
    });
    this.beforeDestroy(function (this: ContentWhichRequiresTwoDestroyCalls) {
      this.destroyCount++;
      if (this.destroyCount === 1) {
        throw "abort";
      }
    });
  }
}

export class ContentPosition extends Base {
  static destroyedIds: number[] = [];

  static {
    this.belongsTo("content", { dependent: "destroy" });
    this.beforeDestroy(function (this: ContentPosition) {
      ContentPosition.destroyedIds.push(this.id as number);
    });
  }
}
