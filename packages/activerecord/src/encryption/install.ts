import { Base } from "../base.js";
import { Relation } from "../relation.js";
import { UniquenessValidator } from "../validations.js";
import { Configurable } from "./configurable.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { ExtendedDeterministicQueries } from "./extended-deterministic-queries.js";
import {
  ExtendedDeterministicUniquenessValidator,
  EncryptedUniquenessValidator,
} from "./extended-deterministic-uniqueness-validator.js";

export function installExtendedQueriesIfConfigured(): boolean {
  if (!Configurable.config.extendQueries) return ExtendedDeterministicQueries.installed;
  ExtendedDeterministicQueries.installSupport({ Relation, Base, EncryptedAttributeType });
  ExtendedDeterministicUniquenessValidator.installSupport({
    UniquenessValidator,
    EncryptedUniquenessValidator,
  });
  return ExtendedDeterministicQueries.installed;
}
