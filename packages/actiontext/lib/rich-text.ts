import "./constants.rich-text.generated.js";
import { runLoadHooks } from "@blazetrails/activesupport";
import { ActiveStorage } from "@blazetrails/activestorage";
import { isBlank, isPresent } from "@blazetrails/activesupport";
import { RuntimeError, uniq } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import { Content } from "./content.js";
import { Record } from "./record.js";

export class RichText extends Record {
  declare name: string;
  declare body: Content | null;
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  private _plainText?: [string | undefined, string];

  static {
    this.serialize("body", { coder: Content });

    this.belongsTo("record", { polymorphic: true, touch: true });

    (this as unknown as { hasManyAttached(name: string): void }).hasManyAttached("embeds");

    /**
     * @inventedArm canonicalized — PERMANENT
     * @inventedArm toPlainText — PERMANENT
     */
    this.beforeSave(async (record: RichText) => {
      if (record.body != null && record.body.isPresent()) {
        const body = await record.body.canonicalized;
        await record.toPlainText();
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

  override toString(): string {
    return this.body == null ? "" : (this.body.toString() as string);
  }

  isNil(): boolean {
    return this.body == null;
  }

  async toPlainText(): Promise<string> {
    const body = this.body;
    const plainText = String((await body?.toPlainText()) ?? "");
    this._plainText = [body?.toHtml(), plainText];
    return plainText;
  }

  async toTrixHtml(): Promise<string | undefined> {
    return this.body?.toTrixHtml();
  }

  isEmpty(): boolean {
    return this.loadedPlainText() === "";
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  loadedPlainText(): string {
    if (this.body == null) return "";
    if (this._plainText != null && this._plainText[0] === this.body.toHtml())
      return this._plainText[1];
    throw new RuntimeError("to_plain_text is not loaded; `await richText.toPlainText()` first.");
  }
}

RichText.prototype.isBlank = function (this: RichText) {
  return isBlank(this.loadedPlainText());
};
RichText.prototype.isPresent = function (this: RichText) {
  return isPresent(this.loadedPlainText());
};

ActionText.RichText = RichText;

runLoadHooks("action_text_rich_text", RichText);
