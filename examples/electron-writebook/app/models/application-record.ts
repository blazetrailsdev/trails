import { Base } from "@blazetrails/activerecord";
import type {
  ClassMethods as HasMarkdownClassMethods,
  HasMarkdown,
} from "../../lib/trails-ext/action-text-has-markdown.ts";

export class ApplicationRecord extends Base {
  declare static hasMarkdown: (typeof HasMarkdownClassMethods)["hasMarkdown"];
  declare safeMarkdownAttribute: (typeof HasMarkdown)["safeMarkdownAttribute"];

  static {
    this.primaryAbstractClass();
  }
}
