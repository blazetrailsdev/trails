/**
 * Port of vendor/rails/activerecord/test/cases/signed_id_test.rb
 * Test names match the Rails counterpart.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { travel, travelBack } from "@blazetrails/activesupport";
import { Base, RecordNotFound, registerModel } from "./index.js";
import { UnknownPrimaryKey } from "./errors.js";
import { setSignedIdVerifierSecret, setSignedIdVerifier, signedIdVerifier } from "./signed-id.js";
import { Account } from "./test-helpers/models/account.js";
import { Toy } from "./test-helpers/models/toy.js";
import { Company } from "./test-helpers/models/company.js";
import { Matey } from "./test-helpers/models/matey.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useFixtures } from "./test-helpers/use-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

const SIGNED_ID_VERIFIER_TEST_SECRET = () =>
  "This is normally set by the railtie initializer when used with Rails!";

const MINUTE = 60;

describe("SignedIdTest", () => {
  setupHandlerSuite();

  // Rails: class GetSignedIDInCallback < ActiveRecord::Base ... after_create :set_signed_id
  class GetSignedIDInCallback extends Base {
    static _tableName = "accounts";
    signedIdFromCallback: string | null = null;
    static {
      this.afterCreate(function (record: GetSignedIDInCallback) {
        record.signedIdFromCallback = (record as any).signedId();
      });
    }
  }

  useFixtures(["accounts", "companies", "toys"], () => Base.connection);

  beforeAll(async () => {
    registerModel(Account);
    registerModel(Company);
    registerModel(Toy);
    await defineSchema({ mateys: TEST_SCHEMA.mateys });
  });

  let account: Account;
  let toy: Toy;
  beforeEach(async () => {
    setSignedIdVerifierSecret(SIGNED_ID_VERIFIER_TEST_SECRET);
    account = (await Account.first())!;
    toy = (await Toy.first())!;
  });

  afterEach(() => {
    travelBack();
    setSignedIdVerifierSecret(SIGNED_ID_VERIFIER_TEST_SECRET);
  });

  it("find signed record", async () => {
    expect((await Account.findSigned((account as any).signedId()))?.id).toBe(account.id);
  });

  it("find signed record on relation", async () => {
    expect((await Account.where("1=1").findSigned((account as any).signedId()))?.id).toBe(
      account.id,
    );

    expect(await Account.where("1=0").findSigned((account as any).signedId())).toBeNull();
  });

  it("find signed record with custom primary key", async () => {
    expect((await Toy.findSigned((toy as any).signedId()))?.id).toEqual((toy as any).id);
  });

  it("find signed record for single table inheritance (STI Models)", async () => {
    const company = (await Company.first())!;
    expect((await Company.findSigned((company as any).signedId()))?.id).toBe(company.id);
  });

  it("find signed record raises UnknownPrimaryKey when a model has no primary key", async () => {
    await expect(Matey.findSigned("this will not be even verified")).rejects.toThrow(
      UnknownPrimaryKey,
    );
  });

  it("find signed record with a bang", async () => {
    expect((await Account.findSignedBang((account as any).signedId())).id).toBe(account.id);
  });

  it("find signed record with a bang on relation", async () => {
    expect((await Account.where("1=1").findSignedBang((account as any).signedId())).id).toBe(
      account.id,
    );

    await expect(Account.where("1=0").findSignedBang((account as any).signedId())).rejects.toThrow(
      RecordNotFound,
    );
  });

  it("find signed record with a bang with custom primary key", async () => {
    expect((await Toy.findSignedBang((toy as any).signedId())).id).toEqual((toy as any).id);
  });

  it("find signed record with a bang for single table inheritance (STI Models)", async () => {
    const company = (await Company.first())!;
    expect((await Company.findSignedBang((company as any).signedId())).id).toBe(company.id);
  });

  it("fail to find record from broken signed id", async () => {
    expect(await Account.findSigned("this won't find anything")).toBeNull();
  });

  it("find signed record within expiration duration", async () => {
    expect((await Account.findSigned((account as any).signedId({ expiresIn: MINUTE })))?.id).toBe(
      account.id,
    );
  });

  it("fail to find signed record within expiration duration", async () => {
    const signedId = (account as any).signedId({ expiresIn: MINUTE });
    travel(2 * MINUTE * 1000);
    expect(await Account.findSigned(signedId)).toBeNull();
  });

  it("fail to find record from that has since been destroyed", async () => {
    const signedId = (account as any).signedId({ expiresIn: MINUTE });
    await account.destroy();
    expect(await Account.findSigned(signedId)).toBeNull();
  });

  it("find signed record within expiration time", async () => {
    expect(
      (
        await Account.findSigned(
          (account as any).signedId({ expiresAt: Temporal.Now.instant().add({ minutes: 1 }) }),
        )
      )?.id,
    ).toBe(account.id);
  });

  it("fail to find signed record within expiration time", async () => {
    const signedId = (account as any).signedId({
      expiresAt: Temporal.Now.instant().add({ minutes: 1 }),
    });
    travel(2 * MINUTE * 1000);
    expect(await Account.findSigned(signedId)).toBeNull();
  });

  it("find signed record with purpose", async () => {
    expect(
      (await Account.findSigned((account as any).signedId({ purpose: "v1" }), { purpose: "v1" }))
        ?.id,
    ).toBe(account.id);
  });

  it("fail to find signed record with purpose", async () => {
    expect(await Account.findSigned((account as any).signedId({ purpose: "v1" }))).toBeNull();

    expect(
      await Account.findSigned((account as any).signedId({ purpose: "v1" }), { purpose: "v2" }),
    ).toBeNull();
  });

  it("finding record from broken signed id raises on the bang", async () => {
    await expect(Account.findSignedBang("this will blow up")).rejects.toThrow();
  });

  it("find signed record with a bang within expiration duration", async () => {
    expect(
      (await Account.findSignedBang((account as any).signedId({ expiresIn: MINUTE }))).id,
    ).toBe(account.id);
  });

  it("finding signed record outside expiration duration raises on the bang", async () => {
    const signedId = (account as any).signedId({ expiresIn: MINUTE });
    travel(2 * MINUTE * 1000);

    await expect(Account.findSignedBang(signedId)).rejects.toThrow();
  });

  it("finding signed record that has been destroyed raises on the bang", async () => {
    const signedId = (account as any).signedId({ expiresIn: MINUTE });
    await account.destroy();

    await expect(Account.findSignedBang(signedId)).rejects.toThrow(RecordNotFound);
  });

  it("find signed record with bang with purpose", async () => {
    expect(
      (
        await Account.findSignedBang((account as any).signedId({ purpose: "v1" }), {
          purpose: "v1",
        })
      ).id,
    ).toBe(account.id);
  });

  it("find signed record with bang with purpose raises", async () => {
    await expect(
      Account.findSignedBang((account as any).signedId({ purpose: "v1" })),
    ).rejects.toThrow();

    await expect(
      Account.findSignedBang((account as any).signedId({ purpose: "v1" }), { purpose: "v2" }),
    ).rejects.toThrow();
  });

  it("fail to work without a signed_id_verifier_secret", async () => {
    setSignedIdVerifierSecret(null);

    try {
      expect(() => (account as any).signedId()).toThrow();
    } finally {
      setSignedIdVerifierSecret(SIGNED_ID_VERIFIER_TEST_SECRET);
    }
  });

  it("fail to work without when signed_id_verifier_secret lambda is nil", async () => {
    setSignedIdVerifierSecret(() => null);

    try {
      expect(() => (account as any).signedId()).toThrow();
    } finally {
      setSignedIdVerifierSecret(SIGNED_ID_VERIFIER_TEST_SECRET);
    }
  });

  it("always output url_safe", async () => {
    const signedId = (account as any).signedId({ purpose: "~~~~~~~~~" });
    expect(signedId.includes("+")).toBe(false);
  });

  it("use a custom verifier", async () => {
    const oldVerifier = signedIdVerifier(Account);
    setSignedIdVerifier(Account, new MessageVerifier("sekret"));
    try {
      expect(signedIdVerifier(Base)).not.toBe(signedIdVerifier(Account));
      expect((await Account.findSigned((account as any).signedId()))?.id).toBe(account.id);
    } finally {
      setSignedIdVerifier(Account, oldVerifier);
    }
  });

  it("cannot get a signed ID for a new record", async () => {
    expect(() => (new Account() as any).signedId()).toThrow(
      /Cannot get a signed_id for a new record/,
    );
  });

  it("can get a signed ID in an after_create", async () => {
    expect((await GetSignedIDInCallback.create()).signedIdFromCallback).not.toBeNull();
  });
});
