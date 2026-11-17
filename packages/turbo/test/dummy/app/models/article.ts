import { parameterize } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";

export class Article extends ApplicationRecord {
  declare body: string;

  static {
    this.hasMany("comments");

    this.validates("body", { presence: true });

    Object.assign(this.prototype, {
      toGidParam(this: Article): string {
        return this.toParam()!;
      },

      toParam(this: Article): string {
        return parameterize(this.body);
      },
    });
  }
}
constSet(TopLevel, "Article", Article);
