import * as TestCase from "../support/test-case.js";
import { include } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { KeyValue } from "../../lib/backend/key-value.js";
import { Simple } from "../../lib/backend/simple.js";
import { Memoize } from "../../lib/backend/memoize.js";
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

describe("I18nMemoizeBackendWithSimpleApiTest", () => {
  class MemoizeBackend extends Simple {}
  include(MemoizeBackend, Memoize);

  beforeEach(async () => {
    config().backend = new MemoizeBackend();
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

  it("make sure we use the MemoizeBackend backend", () => {
    expect(config().backend.constructor).toBe(MemoizeBackend);
  });
});

describe("I18nMemoizeBackendWithKeyValueApiTest", () => {
  class MemoizeBackend extends KeyValue {}
  include(MemoizeBackend, Memoize);

  beforeEach(async () => {
    config().backend = new MemoizeBackend(new Map());
    await TestCase.setup();
  });
  afterEach(TestCase.teardown);

  testsBasics();
  testsDefaults();
  testsLookup();
  testsPluralization();
  testsLocalizationDate();
  testsLocalizationDateTime();
  testsLocalizationTime();

  it("make sure we use the MemoizeBackend backend", () => {
    expect(config().backend.constructor).toBe(MemoizeBackend);
  });
});
