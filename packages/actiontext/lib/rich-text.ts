import "./constants.rich-text.generated.js";
import { runLoadHooks } from "@blazetrails/activesupport";
import { ActiveStorage } from "@blazetrails/activestorage";
import { uniq } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import { Content } from "./content.js";
import { Record } from "./record.js";

export class RichText extends Record {
  declare name: string;
  declare body: Content | null;

  static {
    this.serialize("body", { coder: Content });

    this.belongsTo("record", { polymorphic: true, touch: true });

    (this as unknown as { hasManyAttached(name: string): void }).hasManyAttached("embeds");

    /** @inventedArm canonicalized — PERMANENT */
    this.beforeSave(async (record: RichText) => {
      if (record.body != null && record.body.isPresent()) {
        const body = await record.body.canonicalized;
        await (record as unknown as { setEmbeds(attachables: unknown): Promise<void> }).setEmbeds(
          uniq(
            (await body.attachables()).filter(
              (attachable) => attachable instanceof ActiveStorage.Blob!,
            ),
          ),
        );
      }
    });
  }

  isNil(): boolean {
    return this.body == null;
  }

  async toPlainText(): Promise<string> {
    return String((await this.body?.toPlainText()) ?? "");
  }

  async toTrixHtml(): Promise<string | undefined> {
    return this.body?.toTrixHtml();
  }

  async isEmpty(): Promise<boolean> {
    return (await this.toPlainText()) === "";
  }
}

ActionText.RichText = RichText;

runLoadHooks("action_text_rich_text", RichText);
