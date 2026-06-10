export class Topic extends Base {
  static {
    this.scope("withKwargs", (rel, approved = false) => rel.where({ approved }));
    this.scope("limited", (rel, limit: number, offset = 0) => rel.limit(limit).offset(offset));
    this.scope("named", (rel, name = "draft") => rel.where({ name }));
    this.scope("typedRest", (rel, ...ids: number[]) => rel.where({ id: ids }));
    this.scope("untypedRest", (rel, ...args) => rel.where({ args }));
  }
}
