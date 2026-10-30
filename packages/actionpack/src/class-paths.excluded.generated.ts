import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./action-dispatch/system-test-case.js";
import * as m1 from "./action-dispatch/system-testing/browser.js";
import * as m2 from "./action-dispatch/system-testing/driver.js";
import * as m3 from "./action-dispatch/system-testing/server.js";
import * as m4 from "./action-dispatch/system-testing/test-helpers/screenshot-helper.js";
import * as m5 from "./action-dispatch/system-testing/test-helpers/setup-and-teardown.js";

registerClassPaths([
  [() => m0.SystemTestCase, "ActionDispatch::SystemTestCase"],
  [() => m1.Browser, "ActionDispatch::SystemTesting::Browser"],
  [() => m2.Driver, "ActionDispatch::SystemTesting::Driver"],
  [() => m3.Server, "ActionDispatch::SystemTesting::Server"],
  [() => m4.ScreenshotHelper, "ActionDispatch::SystemTesting::TestHelpers::ScreenshotHelper"],
  [() => m5.SetupAndTeardown, "ActionDispatch::SystemTesting::TestHelpers::SetupAndTeardown"],
]);
