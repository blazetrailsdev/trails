import { Base } from "@blazetrails/activerecord";

// Split out so `Author`'s `this.hasMany("comments")` forces the
// virtualizer's auto-import pass to inject `import type { Comment }`
// into virtualized-patterns.test-d.ts. A regression in that pass
// (e.g. the model registry missing an entry, or `Comment` failing
// to resolve across files) would surface as a type error in CI.
export class Comment extends Base {
  static {
    this.attribute("body", "string");
    this.attribute("post_id", "integer");
  }
}
