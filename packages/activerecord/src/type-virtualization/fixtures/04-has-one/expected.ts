export class User extends Base {
  declare profile: Profile | null | Promise<Profile | null>;

  static {
    this.hasOne("profile");
  }
}
