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

/**
 * Boot-time entrypoint. Installs the deterministic-encryption query
 * patches against the real `Relation`, `Base`, and `EncryptedAttributeType`
 * classes if `Configurable.config.extendQueries` is true.
 *
 * Also installs `EncryptedUniquenessValidator` into `UniquenessValidator`
 * so uniqueness checks cover all previous encryption schemes.
 *
 * Mirrors: the Rails railtie that calls
 * `ActiveRecord::Encryption::ExtendedDeterministicQueries.install_support`
 * and `ActiveRecord::Encryption::ExtendedDeterministicUniquenessValidator.install_support`
 * when `config.active_record.encryption.extend_queries` is set.
 *
 * Safe to call multiple times — both installers are idempotent. Returns
 * whether `ExtendedDeterministicQueries` patches are currently installed,
 * regardless of the current `extendQueries` flag (i.e. returns `true`
 * even if patches were installed in a prior call before the flag was cleared).
 * Note: `ExtendedDeterministicUniquenessValidator` is installed at the same
 * time; call `ExtendedDeterministicUniquenessValidator.resetSupport()` in
 * test teardown to undo the `UniquenessValidator#validateEach` patch.
 */
export function installExtendedQueriesIfConfigured(): boolean {
  if (!Configurable.config.extendQueries) return ExtendedDeterministicQueries.installed;
  ExtendedDeterministicQueries.installSupport({ Relation, Base, EncryptedAttributeType });
  ExtendedDeterministicUniquenessValidator.installSupport({
    UniquenessValidator,
    EncryptedUniquenessValidator,
  });
  return ExtendedDeterministicQueries.installed;
}
