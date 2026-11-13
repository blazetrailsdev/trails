import "./constants.encrypted-rich-text.generated.js";
import { runLoadHooks } from "@blazetrails/activesupport";
import { ActionText } from "./action-text.js";
import { RichText } from "./rich-text.js";

export class EncryptedRichText extends RichText {
  static {
    this.encrypts("body");
  }
}

ActionText.EncryptedRichText = EncryptedRichText;

runLoadHooks("action_text_encrypted_rich_text", EncryptedRichText);
