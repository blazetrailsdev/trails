import { ApplicationController } from "./application-controller.ts";
import { Current } from "../models/current.ts";
import { Room } from "../models/room.ts";
import { Message } from "../models/message.ts";

export class MessagesController extends ApplicationController {
  declare room: Room;
  declare message: Message;

  static {
    this.beforeAction(":setRoom");
  }

  async create(): Promise<void> {
    const params = this.params.expect({ message: ["body", "parent_id", { attachments: [] }] });
    const attachments = ((params.get("attachments") as unknown[] | null) ?? []).filter(
      (a) => a != null && a !== "",
    );
    this.message = new Message({
      body: params.get("body"),
      parent_id: params.get("parent_id") || null,
      room: this.room,
      user: Current.user!,
    });
    if (attachments.length > 0) await this.message.attachments.attach(...attachments);

    if (await this.message.save()) {
      // The broadcast appends the message for everyone (including the author); the
      // author's own response just resets the composer.
      await this.respondTo((format) => {
        format.turboStream(() =>
          this.render({
            turboStream: this.turboStream.replace(this.composerId(), {
              partial: "messages/composer",
              locals: { room: this.room, parent: this.parentOf() },
            }),
          }),
        );
        format.html(() => this.redirectTo(this.roomPath(this.room)));
      });
    } else {
      await this.redirectTo(this.roomPath(this.room), {
        alert: this.message.errors.fullMessages.join(", "),
      });
    }
  }

  async destroy(): Promise<void> {
    const message = await this.room.messages.find(this.params.get("id"));
    if (message.user_id === Current.user!.id) await message.destroy();
    await this.respondTo((format) => {
      format.turboStream(() => this.render({ turboStream: this.turboStream.remove(message) }));
      format.html(() => this.redirectTo(this.roomPath(this.room)));
    });
  }

  private parentOf(): { id: unknown } | null {
    return this.message.parent_id == null ? null : { id: this.message.parent_id };
  }

  private composerId(): string {
    return this.message.parent_id == null ? "composer" : `composer_${this.message.parent_id}`;
  }

  protected async setRoom(): Promise<void> {
    this.room = await Room.find(this.params.get("room_id"));
  }
}
