import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { ActiveStorage } from "./active-storage.js";
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
    expect(preview.contentType).toBe("image/png");
    expect(preview.contentTypeForServing()).toBe("image/png");
    expect(preview.forcedDispositionForServing()).toBeUndefined();

    ActiveStorage.contentTypesToServeAsBinary = ["image/png"];
    expect(preview.contentTypeForServing()).toBe(ActiveStorage.binaryContentType);
    expect(preview.forcedDispositionForServing()).toBe("attachment");
  });
});
