import { describe, expect, it } from "vitest";
import { Magic } from "@blazetrails/marcel/magic";
import { ActiveStorage } from "./active-storage.js";
import "./test-helpers/database/setup.js";

describe("ActiveStorage::EngineTest", () => {
  it("all default content types are recognized by marcel", () => {
    for (const contentType of ActiveStorage.variableContentTypes) {
      expect(new Magic(contentType).type).toBe(contentType);
    }

    for (const contentType of ActiveStorage.webImageContentTypes) {
      expect(new Magic(contentType).type).toBe(contentType);
    }

    for (const contentType of ActiveStorage.contentTypesToServeAsBinary) {
      expect(new Magic(contentType).type).toBe(contentType);
    }

    for (const contentType of ActiveStorage.contentTypesAllowedInline) {
      expect(new Magic(contentType).type).toBe(contentType);
    }
  });

  it("image/bmp is a default content type", () => {
    expect(ActiveStorage.variableContentTypes).toContain("image/bmp");
  });

  it("true is the default touch_attachment_records value", () => {
    expect(ActiveStorage.touchAttachmentRecords).toBe(true);
  });
});
