import { Base } from "../../base.js";
import { throwAbort } from "@blazetrails/activesupport";

export class Content extends Base {
  declare contentPosition: ContentPosition | null;
  declare loadHasOne: (name: "contentPosition") => Promise<ContentPosition | null>;

  static _tableName = "content";

  static destroyedIds: number[] = [];

  static {
    this.hasOne("contentPosition", { dependent: "destroy" });
    this.beforeDestroy((record: Content) => {
      Content.destroyedIds.push(record.id as number);
    });
  }
}

export class ContentWhichRequiresTwoDestroyCalls extends Base {
  declare contentPosition: ContentPosition | null;
  declare loadHasOne: (name: "contentPosition") => Promise<ContentPosition | null>;

  static _tableName = "content";

  private destroyCount: number = 0;

  static {
    this.hasOne("contentPosition", { foreignKey: "content_id", dependent: "destroy" });
    this.afterInitialize((record: ContentWhichRequiresTwoDestroyCalls) => {
      record.destroyCount = 0;
    });
    this.beforeDestroy((record: ContentWhichRequiresTwoDestroyCalls) => {
      record.destroyCount++;
      if (record.destroyCount === 1) {
        throwAbort();
      }
    });
  }
}

export class ContentPosition extends Base {
  declare content: Content | null;
  declare loadBelongsTo: (name: "content") => Promise<Content | null>;
  declare content_id: number;

  static destroyedIds: number[] = [];

  static {
    this.belongsTo("content", { dependent: "destroy" });
    this.beforeDestroy((record: ContentPosition) => {
      ContentPosition.destroyedIds.push(record.id as number);
    });
  }
}
