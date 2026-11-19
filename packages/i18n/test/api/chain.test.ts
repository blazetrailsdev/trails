import * as TestCase from "../support/test-case.js";
import { beforeEach, describe, expect, it, afterEach } from "vitest";

import { Chain } from "../../lib/backend/chain.js";
import { Simple } from "../../lib/backend/simple.js";
import { testsBasics } from "../support/tests/basics.js";
import { testsDefaults } from "../support/tests/defaults.js";
import { testsLookup } from "../support/tests/lookup.js";
import { testsPluralization } from "../support/tests/pluralization.js";
import { testsProcs } from "../support/tests/procs.js";
import { testsLocalizationDate } from "../support/tests/localization/date.js";
import { testsLocalizationDateTime } from "../support/tests/localization/date-time.js";
import { testsLocalizationTime } from "../support/tests/localization/time.js";
import { config } from "../../lib/i18n.js";

describe("I18nApiChainTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    config().backend = new Chain(new Simple(), config().backend);
  });
  afterEach(TestCase.teardown);

  testsBasics();
  testsDefaults();
  testsLookup();
  testsPluralization();
  testsProcs();
  testsLocalizationDate();
  testsLocalizationDateTime();
  testsLocalizationTime();

  it("make sure we use the Chain backend", () => {
    expect(config().backend.constructor).toBe(Chain);
  });
});
