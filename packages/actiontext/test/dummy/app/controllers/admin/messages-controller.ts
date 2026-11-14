import { ActionController } from "@blazetrails/actionpack";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Message } from "../../models/message.js";

export class MessagesController extends ActionController.Base {
  declare message: Message;

  async show(): Promise<void> {
    this.message = await Message.find(this.params.get("id"));
  }
}
const Admin = {};
constSet(TopLevel, "Admin", Admin);
constSet(Admin, "MessagesController", MessagesController);
