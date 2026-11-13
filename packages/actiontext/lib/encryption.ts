import type { Base } from "@blazetrails/activerecord";
import { isPresent } from "@blazetrails/activesupport";
import { filterMap, rbCallSuper } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";
import type { EncryptedRichText } from "./encrypted-rich-text.js";

type EncryptionHost = Base & {
  /** @internal */
  _encryptableRichTexts?: EncryptedRichText[];
};

async function encrypt(this: EncryptionHost): Promise<unknown> {
  return await this.transaction(async () => {
    await rbCallSuper(this, encrypt);
    if (await hasEncryptedRichTexts.call(this)) return await encryptRichTexts.call(this);
  });
}

async function decrypt(this: EncryptionHost): Promise<unknown> {
  return await this.transaction(async () => {
    await rbCallSuper(this, decrypt);
    if (await hasEncryptedRichTexts.call(this)) return await decryptRichTexts.call(this);
  });
}

/** @internal */
async function encryptRichTexts(this: EncryptionHost): Promise<EncryptedRichText[]> {
  const richTexts = await encryptableRichTexts.call(this);
  for (const richText of richTexts) await richText.encrypt();
  return richTexts;
}

/** @internal */
async function decryptRichTexts(this: EncryptionHost): Promise<EncryptedRichText[]> {
  const richTexts = await encryptableRichTexts.call(this);
  for (const richText of richTexts) await richText.decrypt();
  return richTexts;
}

/** @internal */
async function hasEncryptedRichTexts(this: EncryptionHost): Promise<boolean> {
  return isPresent(await encryptableRichTexts.call(this));
}

/** @internal */
async function encryptableRichTexts(this: EncryptionHost): Promise<EncryptedRichText[]> {
  if (this._encryptableRichTexts != null) return this._encryptableRichTexts;
  const klass = this.constructor as typeof Base & { richTextAssociationNames(): string[] };
  const records = await Promise.all(
    klass.richTextAssociationNames().map(async (attributeName) => {
      return await (this.association(attributeName) as unknown as { reader: unknown }).reader;
    }),
  );
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
