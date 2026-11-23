export class Message extends Base {
  declare content: import("@blazetrails/actiontext/rich-text.js").RichText;
  declare isContent: () => Promise<boolean>;
  declare setContent: (body: unknown) => Promise<void>;
  declare richTextContent: import("@blazetrails/actiontext/rich-text.js").RichText | null | Promise<import("@blazetrails/actiontext/rich-text.js").RichText | null>;
  declare static withRichTextContent: () => import("@blazetrails/activerecord").Relation<Message>;
  declare static withRichTextContentAndEmbeds: () => import("@blazetrails/activerecord").Relation<Message>;

  static {
    this.hasRichText("content");
  }
}
declare module "@blazetrails/activerecord" {
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    withRichTextContent(this: import("@blazetrails/activerecord").Relation<Message>): import("@blazetrails/activerecord").Relation<Message>;
    withRichTextContentAndEmbeds(this: import("@blazetrails/activerecord").Relation<Message>): import("@blazetrails/activerecord").Relation<Message>;
  }
}
