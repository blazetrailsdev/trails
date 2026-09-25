import { include, onLoad } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { TestFixtures } from "@blazetrails/activerecord/test-fixtures";
import { abort } from "@blazetrails/ruby-compat";
import { Trails } from "./rails.js";

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

const root = await Trails.root();

onLoad("active_support_test_case", function (this: typeof TestCase & FixtureHost) {
  include(this, TestFixtures);

  this.fixturePaths.push(`${root}/test/fixtures/`);
  this.fileFixturePath = `${root}/test/fixtures/files`;
});

onLoad("action_dispatch_integration_test", function (this: FixtureHost) {
  this.fixturePaths = [
    ...(this.fixturePaths ?? []),
    ...(TestCase as unknown as FixtureHost).fixturePaths,
  ];
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
  this.prototype.beforeSetup = function (this: { routes?: unknown }) {
    this.routes = Trails.application!.routes();
    return superBeforeSetup?.call(this);
  };
});
