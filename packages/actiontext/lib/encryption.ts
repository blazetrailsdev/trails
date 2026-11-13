import type { Base } from "@blazetrails/activerecord";
import { isPresent } from "@blazetrails/activesupport";
import { filterMap, rbCallSuper } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import type { EncryptedRichText } from "./encrypted-rich-text.js";

type EncryptionHost = Base & {
  encryptRichTexts(): Promise<EncryptedRichText[]>;
  decryptRichTexts(): Promise<EncryptedRichText[]>;
  hasEncryptedRichTexts(): Promise<boolean>;
  encryptableRichTexts(): Promise<EncryptedRichText[]>;
  /** @internal */
  _encryptableRichTexts?: EncryptedRichText[];
};

async function encrypt(this: EncryptionHost): Promise<unknown> {
  return await this.transaction(async () => {
    await rbCallSuper(this, encrypt);
    if (await this.hasEncryptedRichTexts()) return await this.encryptRichTexts();
  });
}

async function decrypt(this: EncryptionHost): Promise<unknown> {
  return await this.transaction(async () => {
    await rbCallSuper(this, decrypt);
    if (await this.hasEncryptedRichTexts()) return await this.decryptRichTexts();
  });
}

/** @internal */
async function encryptRichTexts(this: EncryptionHost): Promise<EncryptedRichText[]> {
  const richTexts = await this.encryptableRichTexts();
  for (const richText of richTexts) await richText.encrypt();
  return richTexts;
}

/** @internal */
async function decryptRichTexts(this: EncryptionHost): Promise<EncryptedRichText[]> {
  const richTexts = await this.encryptableRichTexts();
  for (const richText of richTexts) await richText.decrypt();
  return richTexts;
}

/** @internal */
async function hasEncryptedRichTexts(this: EncryptionHost): Promise<boolean> {
  return isPresent(await this.encryptableRichTexts());
}

/** @internal */
async function encryptableRichTexts(this: EncryptionHost): Promise<EncryptedRichText[]> {
  if (this._encryptableRichTexts != null) return this._encryptableRichTexts;
  const klass = this.constructor as typeof Base & { richTextAssociationNames(): string[] };
  const records: unknown[] = [];
  for (const attributeName of klass.richTextAssociationNames()) {
    records.push(await (this as unknown as Record<string, unknown>)[attributeName]);
  }
  return (this._encryptableRichTexts = filterMap(records, (record) => record).filter(
    (record) => record instanceof ActionText.EncryptedRichText!,
  ));
}

export const Encryption = {
  encrypt,
  decrypt,
  encryptRichTexts,
  decryptRichTexts,
  hasEncryptedRichTexts,
  encryptableRichTexts,
};

ActionText.Encryption = Encryption;
