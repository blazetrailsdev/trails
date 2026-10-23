import { Encryption } from "../namespaces.js";
import type { ValueType } from "@blazetrails/activemodel";

type FixtureRow = Record<string, unknown>;

export interface EncryptedFixtureHost {
  cleanValues: Record<string, unknown>;
  encryptFixtureData(fixture: FixtureRow, modelClass: unknown): void;
  processPreservedOriginalColumns(fixture: FixtureRow, modelClass: unknown): void;
}

type FixtureModelClass = {
  sourceAttributeFromPreservedAttribute(attributeName: string): string | undefined;
  encryptedAttributes?: Set<string>;
  typeForAttribute(name: string): ValueType;
} | null;

export const EncryptedFixtures = {
  /** @internal */
  encryptFixtureData(
    this: EncryptedFixtureHost,
    fixture: FixtureRow,
    modelClass: FixtureModelClass,
  ): void {
    for (const attributeName of modelClass?.encryptedAttributes ?? []) {
      const cleanValue = fixture[attributeName];
      if (cleanValue != null && cleanValue !== false) {
        this.cleanValues[attributeName] = cleanValue;

        const type = modelClass!.typeForAttribute(attributeName);
        const encryptedValue = type.serialize(cleanValue);
        fixture[attributeName] = encryptedValue;
      }
    }
  },

  /** @internal */
  processPreservedOriginalColumns(
    this: EncryptedFixtureHost,
    fixture: FixtureRow,
    modelClass: FixtureModelClass,
  ): void {
    for (const attributeName of modelClass?.encryptedAttributes ?? []) {
      const sourceAttributeName = modelClass!.sourceAttributeFromPreservedAttribute(attributeName);
      if (sourceAttributeName != null) {
        const cleanValue = this.cleanValues[sourceAttributeName];
        const type = modelClass!.typeForAttribute(attributeName);
        const encryptedValue = type.serialize(cleanValue);
        fixture[attributeName] = encryptedValue;
      }
    }
  },
};

Encryption.EncryptedFixtures = EncryptedFixtures;
