import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./encryption/read-only-null-encryptor.js";

defineConstants([
  [() => m0.ReadOnlyNullEncryptor, "ActiveRecord::Encryption::ReadOnlyNullEncryptor"],
]);
