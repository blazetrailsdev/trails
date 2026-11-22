import { ApplicationController } from "./application-controller.ts";
import { Current } from "../models/current.ts";
import { Room } from "../models/room.ts";
import { User } from "../models/user.ts";

export class DirectsController extends ApplicationController {
  async create(): Promise<void> {
    const other = await User.find(this.params.get("user_id"));
    const room = await Room.directBetween(Current.user!, other);
    await this.redirectTo(this.roomPath(room));
  }
}
