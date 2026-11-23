import { ApplicationController } from "./application-controller.ts";
import { Current } from "../models/current.ts";
import { Message } from "../models/message.ts";

/** Toggles the current user's reaction; the message re-renders for everyone. */
export class ReactionsController extends ApplicationController {
  async create(): Promise<void> {
    const message = await Message.find(this.params.get("message_id"));
    const emoji = String(this.params.get("emoji"));
    const user = Current.user!;
    const existing = await message.reactions.findBy({ user_id: user.id, emoji });
    if (existing) await existing.destroy();
    else await message.reactions.create({ user, emoji });
    await message.reload();
    await message.broadcastRefreshEverywhere();
    await this.head(":no_content");
  }
}
