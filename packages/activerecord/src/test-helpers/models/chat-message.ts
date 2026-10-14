import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class ChatMessage extends Base {}
registerModel(ChatMessage);

export class ChatMessageCustomPk extends Base {
  static _tableName = "chat_messages_custom_pk";
}
registerModel(ChatMessageCustomPk);
