import { describe, expect, it } from "vitest";
import { NoMethodError, rbFPublicSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";

describe("Tags::Base helper visibility", () => {
  const tag = new Base("post", "title", {});

  it("keeps the private groups of ActiveModelInstanceTag, TagHelper and FormTagHelper private", () => {
    for (const name of [
      "isObjectHasErrors",
      "isSelectMarkupHelper",
      "isTagGenerateErrors",
      "buildTagValues",
      "tagBuilder",
      "htmlOptionsForForm",
      "extraTagsForForm",
      "formTagHtml",
      "formTagWithBody",
      "sanitizeToId",
      "setDefaultDisableWith",
    ]) {
      expect(rbObjRespondTo(tag, name)).toBe(false);
      expect(rbObjRespondTo(tag, name, true)).toBe(true);
      expect(() => rbFPublicSend(tag, name)).toThrow(NoMethodError);
    }
  });

  it("leaves the public groups public", () => {
    for (const name of [
      "errorWrapping",
      "errorMessage",
      "tag",
      "contentTag",
      "tokenList",
      "labelTag",
      "submitTag",
    ]) {
      expect(rbObjRespondTo(tag, name)).toBe(true);
    }
  });
});
