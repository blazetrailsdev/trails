export class User extends Base {
  static {
    this.hasOneAttached("avatar");
    this.hasOneAttached("coverPhoto");
    this.hasManyAttached("highlights");
  }
}
