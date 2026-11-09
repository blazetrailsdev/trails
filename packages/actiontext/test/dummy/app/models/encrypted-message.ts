import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Message } from "./message.js";

export class EncryptedMessage extends Message {}
constSet(TopLevel, "EncryptedMessage", EncryptedMessage);
