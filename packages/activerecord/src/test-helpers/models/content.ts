// vendor/rails/activerecord/test/models/content.rb
import { Base } from "../../base.js";

export class Content extends Base {
  static _tableName = "content";

  static destroyedIds: number[] = [];

  static {
    this.hasOne("contentPosition", { dependent: "destroy" });
    this.beforeDestroy(function (this: Content, record?: Content) {
      // The callback runner (activesupport ProcCall) invokes function filters as
      // `fn(record)` with `this` unbound, so read the record argument — matching
      // the documented `beforeDestroy(fn: (record) => ...)` contract.
      const self = (record ?? this) as Content;
      Content.destroyedIds.push(self.id as number);
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
    this.beforeDestroy(function (this: ContentPosition, record?: ContentPosition) {
      // See Content.beforeDestroy: `this` is unbound for function filters; the
      // record arrives as the first argument.
      const self = (record ?? this) as ContentPosition;
      ContentPosition.destroyedIds.push(self.id as number);
    });
  }
}
