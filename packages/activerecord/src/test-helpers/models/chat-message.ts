import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class ChatMessage extends Base {}
constSet(TopLevel, "ChatMessage", ChatMessage);
DescendantsTracker.registerSubclass(Base, ChatMessage);

export class ChatMessageCustomPk extends Base {
  static _tableName = "chat_messages_custom_pk";
}
constSet(TopLevel, "ChatMessageCustomPk", ChatMessageCustomPk);
DescendantsTracker.registerSubclass(Base, ChatMessageCustomPk);
