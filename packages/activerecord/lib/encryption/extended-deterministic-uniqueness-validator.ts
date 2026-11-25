import { Encryption } from "../namespaces.js";
import { rbCallSuper } from "@blazetrails/ruby-compat";
import { prepend } from "@blazetrails/ruby-compat/include";
import { UniquenessValidator } from "../validations/uniqueness.js";

export class ExtendedDeterministicUniquenessValidator {
  static installSupport(): void {
    prepend(UniquenessValidator, EncryptedUniquenessValidator);
  }
}

async function validateEach(
  this: object,
  record: any,
  attribute: string,
  value: unknown,
): Promise<void> {
  await rbCallSuper(this, validateEach, record, attribute, value);

  const klass = record.constructor;
  if (klass.deterministicEncryptedAttributes()?.includes(attribute)) {
    const encryptedType = klass.typeForAttribute(attribute);
    for (const type of encryptedType.previousTypes) {
      const encryptedValue = type.serialize(value);
      await Encryption.withoutEncryption(() =>
        rbCallSuper(this, validateEach, record, attribute, encryptedValue),
      );
    }
  }
}

export const EncryptedUniquenessValidator = { validateEach };

Encryption.ExtendedDeterministicUniquenessValidator = ExtendedDeterministicUniquenessValidator;
