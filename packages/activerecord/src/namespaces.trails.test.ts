import { describe, it, expect, vi } from "vitest";
import { constantize } from "@blazetrails/activesupport";
import "./index.js";
import {
  Associations,
  AttributeMethods,
  ConnectionAdapters,
  Encryption,
  Locking,
  Scoping,
} from "./namespaces.js";
import { eagerLoadBang } from "./active-record.js";
import { Migration } from "./migration.js";
import * as Compatibility from "./migration/compatibility.js";
import { Cipher } from "./encryption/cipher.js";
import { Aes256Gcm } from "./encryption/cipher/aes256-gcm.js";
import { CommandRecorder } from "./migration/command-recorder.js";
import * as JoinTable from "./migration/join-table.js";
import { ExecutionStrategy } from "./migration/execution-strategy.js";
import { DefaultStrategy } from "./migration/default-strategy.js";
import { NullEncryptor } from "./encryption/null-encryptor.js";
import { Scheme } from "./encryption/scheme.js";
import * as Errors from "./encryption/errors.js";
import { Optimistic } from "./locking/optimistic.js";
import * as Pessimistic from "./locking/pessimistic.js";
import { Default } from "./scoping/default.js";
import * as Named from "./scoping/named.js";
import { Dirty } from "./attribute-methods/dirty.js";
import { TimeZoneConversion } from "./attribute-methods/time-zone-conversion.js";

describe("ActiveRecord namespaces", () => {
  it("constantize resolves the namespaces nested on ActiveRecord", () => {
    expect(constantize("ActiveRecord::Encryption")).toBe(Encryption);
    expect(constantize("ActiveRecord::Associations")).toBe(Associations);
    expect(constantize("ActiveRecord::ConnectionAdapters")).toBe(ConnectionAdapters);
    expect(constantize("ActiveRecord::Associations::CollectionProxy")).toBe(
      Associations.CollectionProxy,
    );
    expect(constantize("ActiveRecord::ConnectionAdapters::ConnectionPool")).toBe(
      ConnectionAdapters.ConnectionPool,
    );
  });

  it("Migration::Compatibility is seated on the Migration class", () => {
    expect(Migration.Compatibility).toBe(Compatibility);
    expect(constantize("ActiveRecord::Migration::Compatibility")).toBe(Compatibility);
  });

  it("Encryption.eager_load! eager loads Cipher", async () => {
    await Encryption.eagerLoadBang();
    expect(Cipher.Aes256Gcm).toBe(Aes256Gcm);
    expect(constantize("ActiveRecord::Encryption::Cipher::Aes256Gcm")).toBe(Aes256Gcm);
  });

  it("ActiveRecord.eager_load! eager loads its nested namespaces in Rails' order", async () => {
    const order: string[] = [];
    for (const [name, ns] of Object.entries({
      Locking,
      Scoping,
      Associations,
      AttributeMethods,
      ConnectionAdapters,
      Encryption,
    })) {
      vi.spyOn(ns, "eagerLoadBang").mockImplementation(async () => void order.push(name));
    }
    await eagerLoadBang();
    vi.restoreAllMocks();
    expect(order).toEqual([
      "Locking",
      "Scoping",
      "Associations",
      "AttributeMethods",
      "ConnectionAdapters",
      "Encryption",
    ]);
  });

  it("ActiveRecord.eager_load! seats the Locking, Scoping and AttributeMethods children", async () => {
    await eagerLoadBang();
    expect(constantize("ActiveRecord::Locking::Optimistic")).toBe(Optimistic);
    expect(constantize("ActiveRecord::Locking::Pessimistic")).toBe(Pessimistic);
    expect(constantize("ActiveRecord::Scoping::Default")).toBe(Default);
    expect(constantize("ActiveRecord::Scoping::Named")).toBe(Named);
    expect(constantize("ActiveRecord::AttributeMethods::Dirty")).toBe(Dirty);
    expect(constantize("ActiveRecord::AttributeMethods::TimeZoneConversion")).toBe(
      TimeZoneConversion,
    );
  });

  it("constantize resolves every constant migration.rb:572-576 autoloads on Migration", () => {
    expect(constantize("ActiveRecord::Migration::CommandRecorder")).toBe(CommandRecorder);
    expect(constantize("ActiveRecord::Migration::JoinTable")).toBe(JoinTable);
    expect(constantize("ActiveRecord::Migration::ExecutionStrategy")).toBe(ExecutionStrategy);
    expect(constantize("ActiveRecord::Migration::DefaultStrategy")).toBe(DefaultStrategy);
  });

  it("constantize resolves the constants encryption.rb:10-35 eager autoloads", async () => {
    await Encryption.eagerLoadBang();
    expect(constantize("ActiveRecord::Encryption::NullEncryptor")).toBe(NullEncryptor);
    expect(constantize("ActiveRecord::Encryption::Scheme")).toBe(Scheme);
    expect(constantize("ActiveRecord::Encryption::Errors::Decryption")).toBe(Errors.Decryption);
  });
});
