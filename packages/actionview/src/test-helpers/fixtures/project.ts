import { Base, type Relation } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

export class Project extends Base {
  static {
    this.hasAndBelongsToMany("developers", function (this: { uniq(): Relation<Base> }) {
      return this.uniq();
    });
  }

  static override async collectionCacheKey(
    collection: Relation<Base> = this.all(),
    _timestampColumn = "updated_at",
  ): Promise<string> {
    return `projects-${await collection.count()}`;
  }
}
(TopLevel as { Project?: typeof Project }).Project = Project;
