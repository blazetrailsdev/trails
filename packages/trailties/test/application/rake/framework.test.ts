import { afterEach, beforeEach, describe, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { assertRaises } from "@blazetrails/activesupport/testing/assertions";
import { FileUtils } from "@blazetrails/ruby-compat/file-utils";
import { include } from "@blazetrails/ruby-compat/include";
import { rbObjMethod } from "@blazetrails/ruby-compat/method";
import { NameError } from "@blazetrails/ruby-compat/name-error";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Trails } from "../../../lib/trails.js";
import type { Generation } from "../../support/isolation/abstract-unit.js";
import "../../support/isolation/abstract-unit.js";

class FrameworkTest extends TestCase {}
include(FrameworkTest, Isolation);
registerSpecType(/^FrameworkTest$/, FrameworkTest);

describe("FrameworkTest", { timeout: 600_000 }, () => {
  let t: Generation;

  beforeEach(async () => {
    t = new FrameworkTest("test") as unknown as Generation;
    await t.buildApp();
    await FileUtils.rmRfAsync(`${await t.appPath()}/config/environments`);
  });

  afterEach(() => t.teardownApp());

  async function loadTasks(): Promise<void> {
    await Trails.application!.loadTasks();
  }

  it("requiring the rake task should not define method .app_generator on Object", async () => {
    await t.bootTrails();

    await loadTasks();

    await assertRaises([NameError], {}, () => rbObjMethod(TopLevel, "appGenerator"));
  });

  it("requiring the rake task should not define method .invoke_from_app_generator on Object", async () => {
    await t.bootTrails();

    await loadTasks();

    await assertRaises([NameError], {}, () => rbObjMethod(TopLevel, "invokeFromAppGenerator"));
  });
});
