import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import { include, rbModConstSet, type Extended } from "@blazetrails/ruby-compat";
import type { Base } from "../base.js";
import { FixtureSet } from "../fixtures.js";
import { ActiveRecord } from "../namespaces.js";
import { TestFixtures, type ClassMethods } from "../test-fixtures.js";
import { FIXTURES_ROOT } from "../test-helpers/fixtures-registry.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class TestCase extends ActiveSupportTestCase {
  declare static fixturePaths: string[];
  declare static fixtureTableNames: string[];
  declare static fixtureClassNames: Record<string, typeof Base | string | null>;
  declare static useInstantiatedFixtures: boolean | string;
  declare static useTransactionalTests: boolean;
  declare static setFixtureClass: Extended<typeof ClassMethods>["setFixtureClass"];
  declare static fixtures: Extended<typeof ClassMethods>["fixtures"];
  declare static setupFixtureAccessors: Extended<typeof ClassMethods>["setupFixtureAccessors"];
  declare static usesTransaction: Extended<typeof ClassMethods>["usesTransaction"];
  declare static isUsesTransaction: Extended<typeof ClassMethods>["isUsesTransaction"];

  static {
    include(this, TestFixtures);
    this.fixturePaths = [FIXTURES_ROOT];
    this.useInstantiatedFixtures = false;
    this.useTransactionalTests = true;
  }

  createFixtures(...fixtureSetNames: string[]) {
    return FixtureSet.createFixtures(
      TestCase.fixturePaths,
      fixtureSetNames,
      this.fixtureClassNames,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface TestCase extends Omit<TestFixtures, "beforeSetup" | "afterTeardown"> {}

rbModConstSet(ActiveRecord, "TestCase", TestCase);
