import { Model } from "@blazetrails/activemodel";
import { constSet, rbModAttrReader, rbModAttrWriter, TopLevel } from "@blazetrails/ruby-compat";

export const Users: Record<string, unknown> = {};
constSet(TopLevel, "Users", Users);

export class Profile extends Model {
  declare id: unknown;
  declare name: unknown;

  static {
    rbModAttrReader(this, "id", "name");
    rbModAttrWriter(this, "id", "name");
  }

  toParam(): string {
    return `users:profile:${this.id}`;
  }

  toPartialPath(): string {
    return "users/profiles/profile";
  }
}
constSet(Users, "Profile", Profile);
