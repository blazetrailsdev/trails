// vendor/rails/activerecord/test/models/chat_message.rb
import { Base } from "../../base.js";

export class ChatMessage extends Base {}

export class ChatMessageCustomPk extends Base {
  static _tableName = "chat_messages_custom_pk";
}
