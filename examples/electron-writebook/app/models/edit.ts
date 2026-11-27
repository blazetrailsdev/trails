import type { TimeWithZone } from "@blazetrails/activesupport";
import { ApplicationRecord } from "./application-record.ts";
import { TYPES } from "./leafable.ts";
import type { Page } from "./page.ts";
import type { Picture } from "./picture.ts";
import type { Section } from "./section.ts";
import type { Leaf } from "./leaf.ts";

export class Edit extends ApplicationRecord {
  declare action: "revision" | "trash";
  declare created_at: TimeWithZone;
  declare leaf: Promise<Leaf>;
  declare leafable: Promise<Page | Section | Picture | null>;
  declare page: Promise<Page | null> | null;
  declare isRevision: () => boolean;

  static {
    this.belongsTo("leaf");
    this.delegatedType("leafable", { types: TYPES });

    this.enum("action", { revision: "revision", trash: "trash" });

    this.afterDestroy(":destroySupersededLeafable", { if: ":isRevision" });

    this.scope("sorted", function () {
      return this.order({ created_at: "desc" });
    });
    this.scope("before", function (edit: Edit) {
      return this.where("created_at < ?", edit.created_at);
    });
    this.scope("after", function (edit: Edit) {
      return this.where("created_at > ?", edit.created_at);
    });
  }

  async previous(): Promise<Edit | null> {
    return await (await this.leaf).edits.before(this).last();
  }

  async next(): Promise<Edit | null> {
    return await (await this.leaf).edits.after(this).first();
  }

  private async destroySupersededLeafable(): Promise<void> {
    await (await this.leafable)?.destroy();
  }
}
