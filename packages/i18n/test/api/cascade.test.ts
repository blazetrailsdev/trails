import * as TestCase from "../support/test-case.js";
import { include } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Simple } from "../../lib/backend/simple.js";
import { Cascade } from "../../lib/backend/cascade.js";
import { testsBasics } from "../support/tests/basics.js";
import { testsDefaults } from "../support/tests/defaults.js";
import { testsLookup } from "../support/tests/lookup.js";
import { testsPluralization } from "../support/tests/pluralization.js";
import { testsProcs } from "../support/tests/procs.js";
import { testsLocalizationDate } from "../support/tests/localization/date.js";
import { testsLocalizationDateTime } from "../support/tests/localization/date-time.js";
import { testsLocalizationTime } from "../support/tests/localization/time.js";
import { testsLocalizationProcs } from "../support/tests/localization/procs.js";
import { config } from "../../lib/i18n.js";

class Backend extends Simple {}
include(Backend, Cascade);

describe("I18nCascadeApiTest", () => {
  beforeEach(async () => {
    config().backend = new Backend();
    await TestCase.setup();
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
  testsLocalizationProcs();

  it("make sure we use a backend with Cascade included", () => {
    expect(config().backend.constructor).toBe(Backend);
  });
});
