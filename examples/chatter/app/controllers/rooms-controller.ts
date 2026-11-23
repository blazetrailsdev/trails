import { ApplicationController } from "./application-controller.ts";
import { Current } from "../models/current.ts";
import { Room } from "../models/room.ts";
import { Message } from "../models/message.ts";

export class RoomsController extends ApplicationController {
  declare room: Room;
  declare messages: Message[];
  /** The landing page opens #general (created on first visit), or the most recent channel. */
  async index(): Promise<void> {
    const user = Current.user!;
    let room = await Room.findBy({ kind: "channel", name: "general" });
    room ??= await Room.createBang({
      kind: "channel",
      name: "general",
      topic: "Company-wide announcements and chatter",
      creator: user,
    });
    await this.redirectTo(this.roomPath(room));
  }

  async show(): Promise<void> {
    this.room = await Room.find(this.params.get("id"));
    const user = Current.user!;
    if (this.room.isDirect() && !(await this.room.memberships.isExists({ user_id: user.id }))) {
      await this.redirectTo(this.rootPath(), { alert: "That conversation isn't yours." });
      return;
    }
    // Joining a channel is implicit on first visit.
    if (!(await this.room.memberships.isExists({ user_id: user.id })))
      await this.room.memberships.createBang({ user });
    await this.room.memberships.where({ user_id: user.id }).updateAll({ last_read_at: new Date() });

    const recent = (await this.room.messages
      .merge(Message.topLevel())
      .includes("user", "reactions", "linkPreviews", { attachmentsAttachments: "blob" })
      .order({ created_at: "desc", id: "desc" })
      .limit(100)
      .toArray()) as Message[];
    this.messages = recent.reverse();
  }

  async new(): Promise<void> {
    this.room = new Room({ kind: "channel" });
  }

  async create(): Promise<void> {
    const user = Current.user!;
    this.room = new Room(this.roomParams());
    this.room.kind = "channel";
    this.room.creator = user;
    if (await this.room.save()) {
      await this.room.memberships.createBang({ user });
      await this.redirectTo(this.roomPath(this.room));
    } else {
      await this.render("new", { status: ":unprocessable_entity" });
    }
  }

  private roomParams() {
    return this.params.expect({ room: ["name", "topic"] });
  }
}
