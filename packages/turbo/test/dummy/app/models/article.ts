import type { AssociationProxy } from "@blazetrails/activerecord";
import type { Comment } from "./comment.js";
import { parameterize } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { ClassMethods as Broadcasts } from "../../../../lib/app/models/concerns/turbo/broadcastable.js";
import { ApplicationRecord } from "./application-record.js";

export class Article extends ApplicationRecord {
  declare body: string;
  declare comments: AssociationProxy<Comment>;

  static {
    this.hasMany("comments");

    this.validates("body", { presence: true });

    (this as unknown as typeof Broadcasts).broadcasts.call(this as never, "overriden-stream", {
      target: "overriden-target",
    });

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
