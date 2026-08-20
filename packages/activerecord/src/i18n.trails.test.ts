import { describe, it, expect } from "vitest";
import { I18n } from "@blazetrails/activemodel";
import "./i18n.js";
import { Base } from "./index.js";

describe("ActiveRecordI18nLoadPathTest", () => {
  it("re-reads Active Model's and Active Record's locales after reload!", async () => {
    I18n.setBackend(new I18n.Simple());
    expect(I18n.t("errors.messages.blank")).toBe("can't be blank");
    expect(I18n.t("errors.messages.taken")).toBe("has already been taken");

    await I18n.reloadBang();

    expect(I18n.t("errors.messages.blank")).toBe("can't be blank");
    expect(I18n.t("errors.messages.taken")).toBe("has already been taken");
  });
});

describe("ActiveRecordTranslationLookupAncestorsTest", () => {
  it("stops at the STI base class", () => {
    class Topic extends Base {}
    class Reply extends Topic {}

    expect(Reply.lookupAncestors()).toEqual([Reply, Topic]);
    expect(Topic.lookupAncestors()).toEqual([Topic]);
    expect(Base.lookupAncestors()).toEqual([Base]);
  });
});
