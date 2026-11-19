import { include } from "@blazetrails/ruby-compat";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { preloadTranslationFiles, registerFileReader } from "../../lib/backend/base.js";
import { Gettext } from "../../lib/backend/gettext.js";
import { Simple } from "../../lib/backend/simple.js";
import { Helpers } from "../../lib/gettext/helpers.js";
import {
  backend,
  setBackend,
  setDefaultSeparator,
  setLoadPath,
  setLocale,
} from "../../lib/i18n.js";
import * as TestCase from "../support/test-case.js";

class Backend extends Simple {}
include(Backend, Gettext);

function localesDir(): string {
  return new URL("../test-data/locales", import.meta.url).pathname;
}

describe("I18nGettextBackendTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    registerFileReader((filename) => readFile(filename, "utf8"));
    await preloadTranslationFiles(`${localesDir()}/de.po`);
    setBackend(new Backend());
    setLocale("en");
    await setLoadPath([`${localesDir()}/de.po`]);
    setDefaultSeparator("|");
  });
  afterEach(TestCase.teardown);

  it("backend loads po file", () => {
    (backend() as unknown as { initTranslations(): void }).initTranslations();
    const translations = (backend() as Simple).translations();
    expect((translations.get(":de") as Map<string, unknown>).get(":Axis")).toBeTruthy();
  });

  it("looks up a translation", () => {
    setLocale("de");
    expect(Helpers.gettext("car")).toBe("Auto");
  });

  it("uses default translation", () => {
    expect(Helpers.gettext("car")).toBe("car");
  });

  it("looks up a namespaced translation", () => {
    setLocale("de");
    expect(Helpers.sgettext("Car|Wheels count")).toBe("Räderzahl");
    expect(Helpers.pgettext("Car", "Wheels count")).toBe("Räderzahl");
    expect(Helpers.pgettext("New car", "Wheels count")).toBe("Räderzahl!");
  });

  it("uses namespaced default translation", () => {
    expect(Helpers.sgettext("Car|Wheels count")).toBe("Wheels count");
    expect(Helpers.pgettext("Car", "Wheels count")).toBe("Wheels count");
    expect(Helpers.pgettext("New car", "Wheels count")).toBe("Wheels count");
  });

  it("pluralizes entry", () => {
    setLocale("de");
    expect(Helpers.ngettext("Axis", "Axis", 1)).toBe("Achse");
    expect(Helpers.ngettext("Axis", "Axis", 2)).toBe("Achsen");
  });

  it("pluralizes default entry", () => {
    expect(Helpers.ngettext("Axis", "Axis", 1)).toBe("Axis");
    expect(Helpers.ngettext("Axis", "Axis", 2)).toBe("Axis");
  });

  it("pluralizes namespaced entry", () => {
    setLocale("de");
    expect(Helpers.nsgettext("Car|wheel", "wheels", 1)).toBe("Rad");
    expect(Helpers.nsgettext("Car|wheel", "wheels", 2)).toBe("Räder");
    expect(Helpers.npgettext("Car", "wheel", "wheels", 1)).toBe("Rad");
    expect(Helpers.npgettext("Car", "wheel", "wheels", 2)).toBe("Räder");
    expect(Helpers.npgettext("New car", "wheel", "wheels", 1)).toBe("Rad!");
    expect(Helpers.npgettext("New car", "wheel", "wheels", 2)).toBe("Räder!");
  });

  it("pluralizes namespaced default entry", () => {
    expect(Helpers.nsgettext("Car|wheel", "wheels", 1)).toBe("wheel");
    expect(Helpers.nsgettext("Car|wheel", "wheels", 2)).toBe("wheels");
    expect(Helpers.npgettext("Car", "wheel", "wheels", 1)).toBe("wheel");
    expect(Helpers.npgettext("Car", "wheel", "wheels", 2)).toBe("wheels");
    expect(Helpers.npgettext("New car", "wheel", "wheels", 1)).toBe("wheel");
    expect(Helpers.npgettext("New car", "wheel", "wheels", 2)).toBe("wheels");
  });

  it("pluralizes namespaced entry with alternative syntax", () => {
    setLocale("de");
    expect(Helpers.nsgettext(["Car|wheel", "wheels"], 1)).toBe("Rad");
    expect(Helpers.nsgettext(["Car|wheel", "wheels"], 2)).toBe("Räder");
    expect(Helpers.npgettext("Car", ["wheel", "wheels"], 1)).toBe("Rad");
    expect(Helpers.npgettext("Car", ["wheel", "wheels"], 2)).toBe("Räder");
    expect(Helpers.npgettext("New car", ["wheel", "wheels"], 1)).toBe("Rad!");
    expect(Helpers.npgettext("New car", ["wheel", "wheels"], 2)).toBe("Räder!");
  });

  it("ngettextpluralizes entry with dots", () => {
    setLocale("de");
    expect(Helpers.n_("On %{count} wheel.", "On %{count} wheels.", 1)).toBe("Auf 1 Achse.");
    expect(Helpers.n_("On %{count} wheel.", "On %{count} wheels.", 2)).toBe("Auf 2 Achsen.");
  });
});
