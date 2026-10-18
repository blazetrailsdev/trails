/* eslint-disable @typescript-eslint/no-explicit-any */
import "../test-helpers/abstract-unit.js";
import { afterEach, beforeEach, describe, it } from "vitest";
import { I18n, assertCalledWith } from "@blazetrails/activesupport";

import { Base } from "../base.js";
import { LookupContext } from "../lookup-context.js";
import { assertDomEqual } from "../testing/dom-assertions.js";

describe("FormOptionsHelperI18nTests", () => {
  let view: Base & Record<string, any>;
  let promptMessage: string;

  beforeEach(() => {
    view = new (Base.withEmptyTemplateCache())(new LookupContext(null, {}, []), {}, null) as Base &
      Record<string, any>;
    promptMessage = "Select!";
    (I18n.backend() as unknown as { initTranslations(): void }).initTranslations();
    I18n.backend().storeTranslations("en", { helpers: { select: { prompt: promptMessage } } });
  });

  afterEach(() => {
    I18n.reloadBang();
  });

  // BLOCKED: i18n-namespace-is-not-stubbable
  it.skip("select with prompt true translates prompt message", () => {
    assertCalledWith(
      I18n,
      "translate",
      ["helpers.select.prompt", { default: "Please select" }],
      {},
      () => {
        view.select("post", "category", [], { prompt: true });
      },
    );
  });

  it("select with translated prompt", () => {
    assertDomEqual(
      `<select id="post_category" name="post[category]"><option value="">${promptMessage}</option>\n</select>`,
      view.select("post", "category", [], { prompt: true }),
    );
  });
});
