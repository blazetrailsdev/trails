import { include, type Extended, type Included } from "@blazetrails/activesupport";
import { ActionController } from "@blazetrails/actionpack";
import { Authentication, type ClassMethods } from "./concerns/authentication.ts";
import { Current } from "../models/current.ts";
import { Room } from "../models/room.ts";
import { User } from "../models/user.ts";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface ApplicationController extends Included<typeof Authentication> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ApplicationController extends ActionController.Base {
  declare static allowUnauthenticatedAccess: Extended<
    typeof ClassMethods
  >["allowUnauthenticatedAccess"];

  declare channels: Room[];
  declare directs: Room[];
  declare people: User[];

  static {
    include(this, Authentication);
    this.beforeAction(":_setSidebar");
  }

  /** The sidebar's channels, the signed-in user's DMs and the people list, for every app page. */
  protected async _setSidebar(): Promise<void> {
    const user = Current.user;
    if (!user) return;
    this.channels = (await Room.channels().toArray()) as Room[];
    this.directs = (await user.rooms
      .merge(Room.directs())
      .order({ updated_at: "desc" })
      .toArray()) as Room[];
    this.people = await User.order({ name: "asc", email_address: "asc" }).limit(50).toArray();
  }
}
