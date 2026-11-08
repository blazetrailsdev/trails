export class User extends Base {
  static {
    this.hasOne("profile");
  }
}
