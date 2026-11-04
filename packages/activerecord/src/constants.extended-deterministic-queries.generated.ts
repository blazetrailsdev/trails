import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./encryption/extended-deterministic-queries.js";

defineConstants([
  [() => m0.ExtendedDeterministicQueries, "ActiveRecord::Encryption::ExtendedDeterministicQueries"],
  [
    () => m0.AdditionalValue,
    "ActiveRecord::Encryption::ExtendedDeterministicQueries::AdditionalValue",
  ],
  [
    () => m0.EncryptedQuery,
    "ActiveRecord::Encryption::ExtendedDeterministicQueries::EncryptedQuery",
  ],
  [
    () => m0.ExtendedEncryptableType,
    "ActiveRecord::Encryption::ExtendedDeterministicQueries::ExtendedEncryptableType",
  ],
  [
    () => m0.RelationQueries,
    "ActiveRecord::Encryption::ExtendedDeterministicQueries::RelationQueries",
  ],
]);
