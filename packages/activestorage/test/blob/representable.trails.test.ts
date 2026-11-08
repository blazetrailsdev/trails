import "../support/database/setup.js";
import { afterEach, describe, expect, it } from "vitest";
import { ActiveStorage } from "../../lib/active-storage.js";
import { Blob } from "../../lib/blob.js";
import { InvariableError } from "../../lib/errors.js";
import { VariantWithRecord } from "../../lib/variant-with-record.js";
import { Variant } from "../../lib/variant.js";

describe("Blob::Representable", () => {
  const trackVariantsWas = ActiveStorage.trackVariants;
  const variableContentTypesWas = ActiveStorage.variableContentTypes;

  afterEach(() => {
    ActiveStorage.trackVariants = trackVariantsWas;
    ActiveStorage.variableContentTypes = variableContentTypesWas;
  });

  function imageBlob() {
    ActiveStorage.variableContentTypes = ["image/png"];
    return new Blob({ filename: "racecar.png", content_type: "image/png" });
  }

  it("reaches Variant when track_variants is false", () => {
    ActiveStorage.trackVariants = false;
    expect(imageBlob().variant({ rotate: 90 })).toBeInstanceOf(Variant);
  });

  it("reaches VariantWithRecord when track_variants is true", () => {
    ActiveStorage.trackVariants = true;
    expect(imageBlob().variant({ rotate: 90 })).toBeInstanceOf(VariantWithRecord);
  });

  it("raises InvariableError for a blob the processor cannot transform", () => {
    ActiveStorage.variableContentTypes = [];
    const blob = new Blob({ filename: "a.txt", content_type: "text/plain" });
    expect(blob.isVariable()).toBe(false);
    expect(() => blob.variant({ rotate: 90 })).toThrow(InvariableError);
  });
});
