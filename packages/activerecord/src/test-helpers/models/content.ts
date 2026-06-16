// vendor/rails/activerecord/test/models/content.rb
import { Base } from "../../base.js";

export class Content extends Base {
  static _tableName = "content";

  static destroyedIds: number[] = [];

  static {
    this.hasOne("contentPosition", { dependent: "destroy" });
    this.beforeDestroy((record: Content) => {
      // Read the record argument, mirroring Rails' `before_destroy do |object|`.
      // `this` is not a reliable handle to the record on the destroy-callback
      // path (empirically `undefined` or a non-record object), so never read it.
      Content.destroyedIds.push(record.id as number);
    });
  }
}

export class ContentWhichRequiresTwoDestroyCalls extends Base {
  static _tableName = "content";

  private destroyCount: number = 0;

  static {
    this.hasOne("contentPosition", { foreignKey: "content_id", dependent: "destroy" });
    // Read the record argument, not `this` — see Content.beforeDestroy. Reading
    // `this` here silently mutates the wrong object, so the first-pass abort
    // would never fire (Rails `before_destroy { @destroy_count += 1; throw :abort
    // if @destroy_count == 1 }`).
    this.afterInitialize((record: ContentWhichRequiresTwoDestroyCalls) => {
      record.destroyCount = 0;
    });
    this.beforeDestroy((record: ContentWhichRequiresTwoDestroyCalls) => {
      record.destroyCount++;
      // Rails `throw :abort` halts the destroy chain (destroy returns false); the
      // trails terminator halts when a before callback returns false.
      if (record.destroyCount === 1) {
        return false;
      }
    });
  }
}

export class ContentPosition extends Base {
  static destroyedIds: number[] = [];

  static {
    this.belongsTo("content", { dependent: "destroy" });
    this.beforeDestroy((record: ContentPosition) => {
      // See Content.beforeDestroy: read the record argument (Rails' `|object|`),
      // never `this`.
      ContentPosition.destroyedIds.push(record.id as number);
    });
  }
}
