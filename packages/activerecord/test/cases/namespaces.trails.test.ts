import { describe, it, expect, vi } from "vitest";
import { Autoload, constantize } from "@blazetrails/activesupport";
import "../../lib/index.js";
import {
  Associations,
  AttributeMethods,
  ConnectionAdapters,
  Encryption,
  Locking,
  Scoping,
} from "../../lib/namespaces.js";
import { eagerLoadBang } from "../../lib/active-record.js";
import { Migration } from "../../lib/migration.js";
import * as Compatibility from "../../lib/migration/compatibility.js";
import { Cipher } from "../../lib/encryption/cipher.js";
import { Aes256Gcm } from "../../lib/encryption/cipher/aes256-gcm.js";
import { CommandRecorder } from "../../lib/migration/command-recorder.js";
import * as JoinTable from "../../lib/migration/join-table.js";
import { ExecutionStrategy } from "../../lib/migration/execution-strategy.js";
import { DefaultStrategy } from "../../lib/migration/default-strategy.js";
import { NullEncryptor } from "../../lib/encryption/null-encryptor.js";
import { Scheme } from "../../lib/encryption/scheme.js";
import * as Errors from "../../lib/encryption/errors.js";
import { Optimistic } from "../../lib/locking/optimistic.js";
import { Pessimistic } from "../../lib/locking/pessimistic.js";
import { Default } from "../../lib/scoping/default.js";
import * as Named from "../../lib/scoping/named.js";
import { Dirty } from "../../lib/attribute-methods/dirty.js";
import { TimeZoneConversion } from "../../lib/attribute-methods/time-zone-conversion.js";
import { Preloader } from "../../lib/associations/preloader.js";
import { ThroughAssociation } from "../../lib/associations/preloader/through-association.js";
import { JoinDependency } from "../../lib/associations/join-dependency.js";
import { JoinAssociation } from "../../lib/associations/join-dependency/join-association.js";
import { AliasTracker } from "../../lib/associations/alias-tracker.js";
import { AssociationScope } from "../../lib/associations/association-scope.js";

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

  it("Associations.eager_load! eager loads Preloader and JoinDependency", async () => {
    await Associations.eagerLoadBang();
    expect(constantize("ActiveRecord::Associations::Preloader")).toBe(Preloader);
    expect(constantize("ActiveRecord::Associations::Preloader::ThroughAssociation")).toBe(
      ThroughAssociation,
    );
    expect(constantize("ActiveRecord::Associations::JoinDependency")).toBe(JoinDependency);
    expect(constantize("ActiveRecord::Associations::JoinDependency::JoinAssociation")).toBe(
      JoinAssociation,
    );
    expect(constantize("ActiveRecord::Associations::AssociationScope")).toBe(AssociationScope);
    expect(constantize("ActiveRecord::Associations::AliasTracker")).toBe(AliasTracker);
  });

  it("Associations.eager_load! seats every constant associations.rb:29-41 eager autoloads", async () => {
    await Associations.eagerLoadBang();
    expect(
      [
        "BelongsToAssociation",
        "BelongsToPolymorphicAssociation",
        "HasManyAssociation",
        "HasManyThroughAssociation",
        "HasOneAssociation",
        "HasOneThroughAssociation",
        "Preloader",
        "JoinDependency",
        "AssociationScope",
        "DisableJoinsAssociationScope",
        "AliasTracker",
      ].filter(
        (constName) =>
          (Associations as unknown as Record<string, unknown>)[constName] === undefined ||
          constantize(`ActiveRecord::Associations::${constName}`) !==
            (Associations as unknown as Record<string, unknown>)[constName],
      ),
    ).toEqual([]);
  });

  it("Associations.eager_load! calls super, then Preloader and JoinDependency", async () => {
    const order: string[] = [];
    vi.spyOn(Autoload, "eagerLoadBang").mockImplementation(async () => void order.push("super"));
    vi.spyOn(Preloader, "eagerLoadBang").mockImplementation(
      async () => void order.push("Preloader"),
    );
    vi.spyOn(JoinDependency, "eagerLoadBang").mockImplementation(
      async () => void order.push("JoinDependency"),
    );
    await Associations.eagerLoadBang();
    vi.restoreAllMocks();
    expect(order).toEqual(["super", "Preloader", "JoinDependency"]);
  });
});
