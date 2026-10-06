import { Encryption } from "../namespaces.js";
import type { PrependModule } from "@blazetrails/ruby-compat";
import type { ValueType } from "@blazetrails/activemodel";

type FixtureRow = Record<string, unknown>;

interface EncryptedFixtureHost {
  cleanValues: Record<string, unknown>;
  encryptFixtureData(fixture: FixtureRow, modelClass: FixtureModelClass): void;
  processPreservedOriginalColumns(fixture: FixtureRow, modelClass: FixtureModelClass): void;
}

type FixtureModelClass = {
  sourceAttributeFromPreservedAttribute(attributeName: string): string | undefined;
  encryptedAttributes?: Set<string>;
  typeForAttribute(name: string): ValueType;
} | null;

export const EncryptedFixtures: PrependModule = {
  initialize(
    this: EncryptedFixtureHost,
    super_: (fixture: FixtureRow, modelClass: FixtureModelClass) => unknown,
    fixture: FixtureRow,
    modelClass: FixtureModelClass,
  ): unknown {
    this.cleanValues = {};
    this.encryptFixtureData(fixture, modelClass);
    this.processPreservedOriginalColumns(fixture, modelClass);
    return super_(fixture, modelClass);
  },

  /** @internal */
  encryptFixtureData(
    this: EncryptedFixtureHost,
    _super: unknown,
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
    _super: unknown,
    fixture: FixtureRow,
    modelClass: FixtureModelClass,
  ): void {
    for (const attributeName of modelClass?.encryptedAttributes ?? []) {
      const sourceAttributeName = modelClass!.sourceAttributeFromPreservedAttribute(attributeName);
      if (sourceAttributeName !== undefined) {
        const cleanValue = this.cleanValues[sourceAttributeName];
        const type = modelClass!.typeForAttribute(attributeName);
        const encryptedValue = type.serialize(cleanValue);
        fixture[attributeName] = encryptedValue;
      }
    }
  },
};

Encryption.EncryptedFixtures = EncryptedFixtures;
