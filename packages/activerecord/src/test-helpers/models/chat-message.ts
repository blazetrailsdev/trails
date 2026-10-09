import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class ChatMessage extends Base {}
registerConstant("ChatMessage", ChatMessage);

export class ChatMessageCustomPk extends Base {
  static _tableName = "chat_messages_custom_pk";
}
registerConstant("ChatMessageCustomPk", ChatMessageCustomPk);
