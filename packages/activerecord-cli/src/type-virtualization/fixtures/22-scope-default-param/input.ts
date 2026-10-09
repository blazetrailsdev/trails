export class Topic extends Base {
  static {
    this.scope("withKwargs", function (this: any, approved = false) {
      return this.where({ approved });
    });
    this.scope("limited", function (this: any, limit: number, offset = 0) {
      return this.limit(limit).offset(offset);
    });
    this.scope("named", function (this: any, name = "draft") {
      return this.where({ name });
    });
    this.scope("typedRest", function (this: any, ...ids: number[]) {
      return this.where({ id: ids });
    });
    this.scope("untypedRest", function (this: any, ...args: unknown[]) {
      return this.where({ args });
    });
  }
}
