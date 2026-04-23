import { Base } from "../base.js";
import { Relation } from "../relation.js";
import { Configurable } from "./configurable.js";
import { EncryptedAttributeType } from "./encrypted-attribute-type.js";
import { ExtendedDeterministicQueries } from "./extended-deterministic-queries.js";

/**
 * Boot-time entrypoint. Installs the deterministic-encryption query
 * patches against the real `Relation`, `Base`, and `EncryptedAttributeType`
 * classes if `Configurable.config.extendQueries` is true.
 *
 * Mirrors: the Rails railtie that calls
 * `ActiveRecord::Encryption::ExtendedDeterministicQueries.install_support`
 * when `config.active_record.encryption.extend_queries` is set.
 *
 * Safe to call multiple times — `installSupport` is idempotent. Returns
 * the effective install state: `true` when the patches are active after
 * this call (whether installed now or in a prior call), `false` when
 * disabled and nothing has been installed yet.
 */
export function installExtendedQueriesIfConfigured(): boolean {
  if (!Configurable.config.extendQueries) return ExtendedDeterministicQueries.installed;
  ExtendedDeterministicQueries.installSupport({ Relation, Base, EncryptedAttributeType });
  return ExtendedDeterministicQueries.installed;
}
