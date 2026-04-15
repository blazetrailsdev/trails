export class User extends Base {
  declare profile: Profile | null;

  static {
    this.hasOne("profile");
  }
}
