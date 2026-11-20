export class User extends Base {
  declare static hasOneAttached: typeof import("@blazetrails/activestorage").Model.ClassMethods.hasOneAttached;
  declare avatar: import("@blazetrails/activestorage").One;
  declare setAvatar: (attachable: unknown) => Promise<void>;
  declare avatarAttachment: import("@blazetrails/activestorage").Attachment | null | Promise<import("@blazetrails/activestorage").Attachment | null>;
  declare avatarBlob: import("@blazetrails/activestorage").Blob | null | Promise<import("@blazetrails/activestorage").Blob | null>;
  declare static withAttachedAvatar: () => import("@blazetrails/activerecord").Relation<User>;
  declare coverPhoto: import("@blazetrails/activestorage").One;
  declare setCoverPhoto: (attachable: unknown) => Promise<void>;
  declare coverPhotoAttachment: import("@blazetrails/activestorage").Attachment | null | Promise<import("@blazetrails/activestorage").Attachment | null>;
  declare coverPhotoBlob: import("@blazetrails/activestorage").Blob | null | Promise<import("@blazetrails/activestorage").Blob | null>;
  declare static withAttachedCoverPhoto: () => import("@blazetrails/activerecord").Relation<User>;
  declare static hasManyAttached: typeof import("@blazetrails/activestorage").Model.ClassMethods.hasManyAttached;
  declare highlights: import("@blazetrails/activestorage").Many;
  declare setHighlights: (attachable: unknown) => Promise<void>;
  declare highlightsAttachments: import("@blazetrails/activerecord").AssociationProxy<import("@blazetrails/activestorage").Attachment>;
  declare highlightsBlobs: import("@blazetrails/activerecord").AssociationProxy<import("@blazetrails/activestorage").Blob>;
  declare static withAttachedHighlights: () => import("@blazetrails/activerecord").Relation<User>;

  static {
    this.hasOneAttached("avatar");
    this.hasOneAttached("coverPhoto");
    this.hasManyAttached("highlights");
  }
}
declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    withAttachedAvatar(this: import("@blazetrails/activerecord").Relation<User>): import("@blazetrails/activerecord").Relation<User>;
    withAttachedCoverPhoto(this: import("@blazetrails/activerecord").Relation<User>): import("@blazetrails/activerecord").Relation<User>;
    withAttachedHighlights(this: import("@blazetrails/activerecord").Relation<User>): import("@blazetrails/activerecord").Relation<User>;
  }
}
