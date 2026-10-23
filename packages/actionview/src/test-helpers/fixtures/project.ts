import { Base, type Relation, registerModel } from "@blazetrails/activerecord";
import { TopLevel } from "@blazetrails/activesupport";

export class Project extends Base {
  declare name: string;

  static {
    this.hasAndBelongsToMany("developers", function (this: Relation<Base>) {
      return (this as Relation<Base> & { uniq(): Relation<Base> }).uniq();
    });
  }

  static override async collectionCacheKey(
    collection: Relation<Project> = this.all(),
    _timestampColumn = "updated_at",
  ): Promise<string> {
    return `projects-${await collection.count()}`;
  }
}
(TopLevel as { Project?: typeof Project }).Project = Project;
registerModel(Project);
