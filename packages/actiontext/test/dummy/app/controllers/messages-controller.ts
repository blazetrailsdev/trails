import { ActionController } from "@blazetrails/actionpack";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Message } from "../models/message.js";

export class MessagesController extends ActionController.Base {
  declare messages: unknown;
  declare message: Message;

  static {
    this.beforeAction(":setMessage", { only: ["show", "edit", "update", "destroy"] });

    this.layout("application");
  }

  index(): void {
    this.messages = Message.all();
  }

  show(): void {}

  new(): void {
    this.message = new Message();
  }

  edit(): void {}

  async create(): Promise<void> {
    this.message = new Message(this.messageParams());

    if (await this.message.save()) {
      this.redirectTo(this.message, { notice: "Message was successfully created." });
    } else {
      await this.render("new", { status: ":unprocessable_entity" });
    }
  }

  async update(): Promise<void> {
    if (await this.message.update(this.messageParams())) {
      this.redirectTo(this.message, { notice: "Message was successfully updated." });
    } else {
      await this.render("edit", { status: ":unprocessable_entity" });
    }
  }

  async destroy(): Promise<void> {
    await this.message.destroy();
    this.redirectTo(this.messagesUrl(), { notice: "Message was successfully destroyed." });
  }

  /** @internal */
  private async setMessage(): Promise<void> {
    this.message = await Message.find(this.params.get("id"));
  }

  /** @internal */
  private messageParams() {
    return this.params.expect({ message: ["subject", "content"] as const });
  }

  declare messagesUrl: () => string;
}
constSet(TopLevel, "MessagesController", MessagesController);
