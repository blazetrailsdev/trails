export class User extends Base {
  declare profile: Profile | null;
  declare loadHasOne: (name: "profile") => Promise<Profile | null>;

  static {
    this.hasOne("profile");
  }
}
