import { TopLevel } from "@blazetrails/ruby-compat";
import { Message } from "../models/message.js";
import type { TagBuilder } from "../../../../lib/app/models/turbo/streams/tag-builder.js";
import { ApplicationController } from "./application-controller.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    MessagesController?: typeof MessagesController;
  }
}

type UrlHelpers = { messageUrl(options: object): string };

export class MessagesController extends ApplicationController {
  declare message: Message;
  declare otherMessage: Message;
  declare messages: unknown;
  declare turboStream: TagBuilder;

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

  async create(): Promise<void> {
    await this.respondTo((format) => {
      format.html(() => this.redirectTo((this as unknown as UrlHelpers).messageUrl({ id: 1 })));
      format.turboStream(async () =>
        this.render({
          turboStream: await this.turboStream.append("messages", "message_1"),
          status: ":created",
        }),
      );
    });
  }

  update(): void {
    this.message = new Message({ id: 1, content: "My message" });
  }
}
TopLevel.MessagesController = MessagesController;
