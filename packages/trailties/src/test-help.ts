import { include, onLoad, type Extended } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import "@blazetrails/activesupport/testing/autorun";
import { TestDatabases } from "@blazetrails/activerecord/test-databases";
import { TestFixtures, type ClassMethods } from "@blazetrails/activerecord/test-fixtures";
import { QueryAssertions } from "@blazetrails/activerecord/testing/query-assertions";
import { abort } from "@blazetrails/ruby-compat";
import { Trails } from "./rails.js";

declare module "@blazetrails/activesupport/test-case" {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- `include ActiveRecord::TestFixtures` in the `on_load(:active_support_test_case)` block below (`railties/lib/rails/test_help.rb:19`) extends `TestFixtures::ClassMethods` onto `ActiveSupport::TestCase`; a namespace merged onto the class is how the added statics surface on the type side.
  namespace TestCase {
    const setFixtureClass: Extended<typeof ClassMethods>["setFixtureClass"];
    const fixtures: Extended<typeof ClassMethods>["fixtures"];
    const setupFixtureAccessors: Extended<typeof ClassMethods>["setupFixtureAccessors"];
    const usesTransaction: Extended<typeof ClassMethods>["usesTransaction"];
    const isUsesTransaction: Extended<typeof ClassMethods>["isUsesTransaction"];
  }
}

interface FixtureHost {
  fixturePaths: string[];
  fileFixturePath?: string;
}

interface RoutesHost {
  prototype: { routes?: unknown; beforeSetup?(): unknown };
}

if (Trails.env["production?"]()) {
  abort("Abort testing: Your Rails environment is running in production mode!");
}

await import("./testing/maintain-test-schema.js");

const root = Trails.root();

onLoad("active_support_test_case", function (this: typeof TestCase & FixtureHost) {
  include(this, TestDatabases);
  include(this, TestFixtures);
  include(this, QueryAssertions);

  this.fixturePaths.push(`${root}/test/fixtures/`);
  this.fileFixturePath = `${root}/test/fixtures/files`;
});

onLoad("action_dispatch_integration_test", function (this: FixtureHost) {
  this.fixturePaths = [...this.fixturePaths, ...(TestCase as unknown as FixtureHost).fixturePaths];
});

onLoad("action_controller_test_case", function (this: RoutesHost) {
  const superBeforeSetup = this.prototype.beforeSetup;
  this.prototype.beforeSetup = function (this: { routes?: unknown }) {
    this.routes = Trails.application!.routes();
    return superBeforeSetup?.call(this);
  };
});

onLoad("action_dispatch_integration_test", function (this: RoutesHost) {
  const superBeforeSetup = this.prototype.beforeSetup;
  this.prototype.beforeSetup = async function (this: { routes?: unknown }) {
    this.routes = Trails.application!.routes();
    await Trails.application!.reloadRoutesUnlessLoaded();
    return superBeforeSetup?.call(this);
  };
});
