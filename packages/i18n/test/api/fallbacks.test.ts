import { include } from "@blazetrails/ruby-compat";
import * as TestCase from "../support/test-case.js";
import { beforeEach, describe, expect, it, afterEach } from "vitest";

import { Fallbacks } from "../../lib/backend/fallbacks.js";
import { Simple } from "../../lib/backend/simple.js";
import { testsBasics } from "../support/tests/basics.js";
import { testsDefaults } from "../support/tests/defaults.js";
import { testsInterpolation } from "../support/tests/interpolation.js";
import { testsLink } from "../support/tests/link.js";
import { testsLookup } from "../support/tests/lookup.js";
import { testsPluralization } from "../support/tests/pluralization.js";
import { testsProcs } from "../support/tests/procs.js";
import { testsLocalizationDate } from "../support/tests/localization/date.js";
import { testsLocalizationDateTime } from "../support/tests/localization/date-time.js";
import { testsLocalizationTime } from "../support/tests/localization/time.js";
import { testsLocalizationProcs } from "../support/tests/localization/procs.js";
import { config } from "../../lib/i18n.js";

class Backend extends Simple {}
include(Backend, Fallbacks);

describe("I18nFallbacksApiTest", () => {
  beforeEach(async () => {
    await TestCase.setup();
    config().backend = new Backend();
  });
  afterEach(TestCase.teardown);

  testsBasics();
  testsDefaults();
  testsInterpolation();
  testsLink();
  testsLookup();
  testsPluralization();
  testsProcs();
  testsLocalizationDate();
  testsLocalizationDateTime();
  testsLocalizationTime();
  testsLocalizationProcs();

  it("make sure we use a backend with Fallbacks included", () => {
    expect(config().backend.constructor).toBe(Backend);
  });
});
