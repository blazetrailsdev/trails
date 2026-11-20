import { describe, expect, it, vi } from "vitest";

describe("importing an engine model before the engine's initializers run", () => {
  it("evaluates Blob, Attachment and VariantRecord on a fresh Base", async () => {
    vi.resetModules();
    const { Blob } = await import("../lib/blob.js");
    const { Attachment } = await import("../lib/attachment.js");
    const { VariantRecord } = await import("../lib/variant-record.js");
    expect(Blob.reflectOnAttachment("previewImage")).not.toBeNull();
    expect(Attachment.name).toBe("Attachment");
    expect(VariantRecord.reflectOnAttachment("image")).not.toBeNull();
  });
});
