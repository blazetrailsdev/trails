import "./test-helpers/database/setup.js";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActiveStorage } from "./active-storage.js";
import { createFileBlob } from "./test-helpers/test-helper.js";
import { VariantWithRecord } from "./variant-with-record.js";
import { Variant } from "./variant.js";

describe("Variant processing", () => {
  const trackVariantsWas = ActiveStorage.trackVariants;
  const variableContentTypesWas = ActiveStorage.variableContentTypes;

  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
  });

  afterEach(() => {
    ActiveStorage.trackVariants = trackVariantsWas;
    ActiveStorage.variableContentTypes = variableContentTypesWas;
  });

  it("processes a Variant onto the service", async () => {
    ActiveStorage.trackVariants = false;
    ActiveStorage.variableContentTypes = ["image/jpeg"];
    const blob = await createFileBlob();
    const variant = await (blob.variant({ resizeToLimit: [10, 10] }) as Variant).processed();
    expect(await blob.service.isExist(variant.key)).toBe(true);
    expect((await variant.download()).length).toBeGreaterThan(0);
  });

  it("processes a VariantWithRecord into a variant record", async () => {
    ActiveStorage.trackVariants = true;
    ActiveStorage.variableContentTypes = ["image/jpeg"];
    const blob = await createFileBlob();
    const variant = blob.variant({ resizeToLimit: [10, 10] }) as VariantWithRecord;
    await variant.processed();
    expect(
      await blob.variantRecords.findBy({ variation_digest: variant.variation.digest }),
    ).not.toBeNull();
    expect(typeof (await variant.key)).toBe("string");
  });
});
