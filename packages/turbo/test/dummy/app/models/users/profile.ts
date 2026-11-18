import { Model } from "@blazetrails/activemodel";
import {
  constSet,
  include,
  rbModAttrReader,
  rbModAttrWriter,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Broadcastable } from "../../../../../lib/app/models/concerns/turbo/broadcastable.js";

export const Users: Record<string, unknown> = {};
constSet(TopLevel, "Users", Users);

export class Profile extends Model {
  declare id: unknown;
  declare name: unknown;

  static {
    include(this, Broadcastable);

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
