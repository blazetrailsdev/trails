export class User extends Base {
  static {
    this.hasOneAttached("avatar");
    this.hasManyAttached("highlights");
  }
}
