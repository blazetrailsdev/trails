import { TopLevel } from "@blazetrails/ruby-compat";
import { Message } from "../models/message.js";
import { ApplicationController } from "./application-controller.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    MessagesController?: typeof MessagesController;
  }
}

export class MessagesController extends ApplicationController {
  declare message: Message;
  declare otherMessage: Message;
  declare messages: unknown;

  async show(): Promise<void> {
    this.message = await Message.find(this.params.get("id"));

    const otherId = this.params.get("other_message");
    if (otherId != null) {
      this.otherMessage = await Message.find(otherId);
    }
  }

  index(): void {
    this.messages = Message.all();
  }

  section(): void {}

  update(): void {
    this.message = new Message({ id: 1, content: "My message" });
  }
}
TopLevel.MessagesController = MessagesController;
