import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ActiveStorage } from "./active-storage.js";
import { Blob } from "./blob.js";
import "./test-helpers/database/setup.js";
import { createFileBlob } from "./test-helpers/test-helper.js";

describe("Preview Servable", () => {
  const variableWas = ActiveStorage.variableContentTypes;
  const inlineWas = ActiveStorage.contentTypesAllowedInline;
  const binaryWas = ActiveStorage.contentTypesToServeAsBinary;

  beforeEach(() => {
    ActiveStorage.verifier = new MessageVerifier("Testing");
    ActiveStorage.variableContentTypes = ["image/png", "image/jpeg"];
  });

  afterEach(() => {
    ActiveStorage.variableContentTypes = variableWas;
    ActiveStorage.contentTypesAllowedInline = inlineWas;
    ActiveStorage.contentTypesToServeAsBinary = binaryWas;
  });

  it("serves a processed preview by its presentation's content type", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    const preview = await blob.preview({ resizeToLimit: [640, 280] }).processed();

    ActiveStorage.contentTypesAllowedInline = ["image/png"];
    ActiveStorage.contentTypesToServeAsBinary = [];
    expect(await preview.contentType).toBe("image/png");
    expect(await preview.contentTypeForServing()).toBe("image/png");
    expect(await preview.forcedDispositionForServing()).toBeUndefined();

    ActiveStorage.contentTypesToServeAsBinary = ["image/png"];
    expect(await preview.contentTypeForServing()).toBe(ActiveStorage.binaryContentType);
    expect(await preview.forcedDispositionForServing()).toBe("attachment");
  });

  it("delegates filename and content type without a prior processed", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    await blob.preview({ resizeToLimit: [640, 280] }).processed();

    const preview = blob.preview({ resizeToLimit: [640, 280] });
    await preview.image.load();
    await (
      await preview.image.attachment
    )?.blob;
    expect((await preview.filename).toString()).toBe("report.png");
    expect(await preview.contentType).toBe("image/png");
  });

  it("delegated reads load the preview image and process the variant", async () => {
    const blob = await createFileBlob({ filename: "report.pdf", contentType: "application/pdf" });
    await blob.preview({ resizeToLimit: [640, 280] }).processed();

    const preview = (await Blob.find(blob.id)).preview({ resizeToLimit: [640, 280] });
    expect((await preview.filename).toString()).toBe("report.png");
    expect(await preview.contentType).toBe("image/png");
  });
});
