import { Base } from "../models/base.js";
// Cross-project association target: auto-import is scoped per-project,
// so the user imports `Author` explicitly from the referenced package.
import type { Author } from "../models/author.js";

export class Post extends Base {
  static {
    this.attribute("title", "string");
    this.belongsTo("author");
  }
}
