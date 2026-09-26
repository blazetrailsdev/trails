import { describe, it, expect, vi } from "vitest";
import { constantize } from "@blazetrails/activesupport";
import "./index.js";
import { Associations, ConnectionAdapters, Encryption } from "./namespaces.js";
import { eagerLoadBang } from "./active-record.js";
import { Migration } from "./migration.js";
import * as Compatibility from "./migration/compatibility.js";
import { Cipher } from "./encryption/cipher.js";
import { Aes256Gcm } from "./encryption/cipher/aes256-gcm.js";

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
    for (const [name, ns] of Object.entries({ Associations, ConnectionAdapters, Encryption })) {
      vi.spyOn(ns, "eagerLoadBang").mockImplementation(async () => void order.push(name));
    }
    await eagerLoadBang();
    vi.restoreAllMocks();
    expect(order).toEqual(["Associations", "ConnectionAdapters", "Encryption"]);
  });
});
