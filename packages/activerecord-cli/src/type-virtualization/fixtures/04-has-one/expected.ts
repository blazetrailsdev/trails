export class User extends Base {
  static {
    this.hasOne("profile");
  }
}
export interface User {
  get profile(): Profile | null | Promise<Profile | null>;
  set profile(value: Profile | null);
}

