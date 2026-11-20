import { describe, expect, it, vi } from "vitest";
import type { Extended } from "@blazetrails/activesupport";
import type { ClassMethods } from "../lib/reflection.js";

describe("importing an engine model before the engine's initializers run", () => {
  it("evaluates Blob, Attachment and VariantRecord on a fresh Base", async () => {
    vi.resetModules();
    const { Blob } = await import("../lib/blob.js");
    const { Attachment } = await import("../lib/attachment.js");
    const { VariantRecord } = await import("../lib/variant-record.js");
    expect(
      (Blob as unknown as Extended<typeof ClassMethods>).reflectOnAttachment("previewImage"),
    ).not.toBeNull();
    expect(Attachment.reflectOnAssociation("blob")).not.toBeNull();
    expect(
      (VariantRecord as unknown as Extended<typeof ClassMethods>).reflectOnAttachment("image"),
    ).not.toBeNull();
  });

  it("keeps a registered attachment reflection when the engine's hook runs again", async () => {
    vi.resetModules();
    const { Base } = await import("@blazetrails/activerecord");
    const { include } = await import("@blazetrails/ruby-compat");
    const { Blob } = await import("../lib/blob.js");
    const { Model } = await import("../lib/attached/model.js");
    const { ActiveRecordExtensions } = await import("../lib/reflection.js");
    include(Base, Model);
    include(Base, ActiveRecordExtensions);
    expect(
      (Blob as unknown as Extended<typeof ClassMethods>).reflectOnAttachment("previewImage"),
    ).not.toBeNull();
  });
});
