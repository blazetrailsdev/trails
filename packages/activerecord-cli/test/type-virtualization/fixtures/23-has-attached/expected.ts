export class User extends Base {
  declare avatar: import("@blazetrails/activestorage").One;
  declare setAvatar: (attachable: unknown) => Promise<void>;
  declare static withAttachedAvatar: () => import("@blazetrails/activerecord").Relation<User>;
  declare highlights: import("@blazetrails/activestorage").Many;
  declare setHighlights: (attachable: unknown) => Promise<void>;
  declare static withAttachedHighlights: () => import("@blazetrails/activerecord").Relation<User>;

  static {
    this.hasOneAttached("avatar");
    this.hasManyAttached("highlights");
  }
}
declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    withAttachedAvatar(this: import("@blazetrails/activerecord").Relation<User>): import("@blazetrails/activerecord").Relation<User>;
    withAttachedHighlights(this: import("@blazetrails/activerecord").Relation<User>): import("@blazetrails/activerecord").Relation<User>;
  }
}
