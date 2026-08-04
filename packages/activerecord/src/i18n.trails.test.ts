import { describe, it, expect } from "vitest";
import { I18n } from "@blazetrails/activemodel";
import "./i18n.js";

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
