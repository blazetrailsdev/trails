import { ApplicationController } from "./application-controller.ts";
import { Message } from "../models/message.ts";

/** A thread opens in the side panel's `thread` turbo-frame. */
export class ThreadsController extends ApplicationController {
  declare parent: Message;
  declare replies: Message[];

  async show(): Promise<void> {
    this.parent = await Message.includes("user", "reactions", "linkPreviews").find(
      this.params.get("message_id"),
    );
    this.replies = (await this.parent.replies
      .includes("user", "reactions", "linkPreviews", { attachmentsAttachments: "blob" })
      .order({ created_at: "asc", id: "asc" })
      .toArray()) as Message[];
  }
}
