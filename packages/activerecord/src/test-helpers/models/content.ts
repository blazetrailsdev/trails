import { Base } from "../../base.js";
import { throwAbort } from "@blazetrails/activesupport";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Content extends Base {
  static _tableName = "content";

  static destroyedIds: number[] = [];

  static {
    this.hasOne("contentPosition", { dependent: "destroy" });
    this.beforeDestroy((record: Content) => {
      Content.destroyedIds.push(record.id as number);
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Content {
  get contentPosition(): ContentPosition | null | Promise<ContentPosition | null>;
  set contentPosition(value: ContentPosition | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ContentWhichRequiresTwoDestroyCalls extends Base {
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ContentWhichRequiresTwoDestroyCalls {
  get contentPosition(): ContentPosition | null | Promise<ContentPosition | null>;
  set contentPosition(value: ContentPosition | null);
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ContentPosition extends Base {
  declare content_id: number;

  static destroyedIds: number[] = [];

  static {
    this.belongsTo("content", { dependent: "destroy" });
    this.beforeDestroy((record: ContentPosition) => {
      ContentPosition.destroyedIds.push(record.id as number);
    });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ContentPosition {
  get content(): Content | null | Promise<Content | null>;
  set content(value: Content | null);
}
