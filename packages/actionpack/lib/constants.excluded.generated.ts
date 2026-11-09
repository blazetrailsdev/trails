import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./action-controller/metal/testing.js";
import * as m1 from "./action-controller/test-case.js";
import * as m2 from "./action-dispatch/system-test-case.js";
import * as m3 from "./action-dispatch/system-testing/browser.js";
import * as m4 from "./action-dispatch/system-testing/driver.js";
import * as m5 from "./action-dispatch/system-testing/server.js";
import * as m6 from "./action-dispatch/system-testing/test-helpers/screenshot-helper.js";
import * as m7 from "./action-dispatch/system-testing/test-helpers/setup-and-teardown.js";
import * as m8 from "./action-dispatch/testing/assertion-response.js";
import * as m9 from "./action-dispatch/testing/assertions.js";
import * as m10 from "./action-dispatch/testing/assertions/response.js";
import * as m11 from "./action-dispatch/testing/assertions/routing.js";
import * as m12 from "./action-dispatch/testing/integration.js";
import * as m13 from "./action-dispatch/testing/request-encoder.js";
import * as m14 from "./action-dispatch/testing/test-helpers/page-dump-helper.js";
import * as m15 from "./action-dispatch/testing/test-process.js";
import * as m16 from "./action-dispatch/testing/test-request.js";
import * as m17 from "./action-dispatch/testing/test-response.js";

defineConstants([
  [() => m1.LiveTestResponse, "ActionController::LiveTestResponse"],
  [() => m1.TestCase, "ActionController::TestCase"],
  [() => m1.Behavior, "ActionController::TestCase::Behavior"],
  [() => m1.ClassMethods, "ActionController::TestCase::Behavior::ClassMethods"],
  [() => m0.Testing, "ActionController::Testing"],
  [() => m0.Functional, "ActionController::Testing::Functional"],
  [() => m1.TestRequest, "ActionController::TestRequest"],
  [() => m1.TestRequest.ENCODER, "ActionController::TestRequest::ENCODER"],
  [() => m1.TestSession, "ActionController::TestSession"],
  [() => m8.AssertionResponse, "ActionDispatch::AssertionResponse"],
  [() => m9.Assertions, "ActionDispatch::Assertions"],
  [() => m10.ResponseAssertions, "ActionDispatch::Assertions::ResponseAssertions"],
  [() => m11.RoutingAssertions, "ActionDispatch::Assertions::RoutingAssertions"],
  [
    () => m11.WithIntegrationRouting,
    "ActionDispatch::Assertions::RoutingAssertions::WithIntegrationRouting",
  ],
  [() => m12.RequestHelpers, "ActionDispatch::Integration::RequestHelpers"],
  [() => m12.Runner, "ActionDispatch::Integration::Runner"],
  [() => m12.Session, "ActionDispatch::Integration::Session"],
  [() => m12.IntegrationTest, "ActionDispatch::IntegrationTest"],
  [() => m13.RequestEncoder, "ActionDispatch::RequestEncoder"],
  [() => m13.IdentityEncoder, "ActionDispatch::RequestEncoder::IdentityEncoder"],
  [() => m2.SystemTestCase, "ActionDispatch::SystemTestCase"],
  [() => m3.Browser, "ActionDispatch::SystemTesting::Browser"],
  [() => m4.Driver, "ActionDispatch::SystemTesting::Driver"],
  [() => m5.Server, "ActionDispatch::SystemTesting::Server"],
  [() => m6.ScreenshotHelper, "ActionDispatch::SystemTesting::TestHelpers::ScreenshotHelper"],
  [() => m7.SetupAndTeardown, "ActionDispatch::SystemTesting::TestHelpers::SetupAndTeardown"],
  [() => m14.InvalidResponse, "ActionDispatch::TestHelpers::PageDumpHelper::InvalidResponse"],
  [() => m15.TestProcess, "ActionDispatch::TestProcess"],
  [() => m15.FixtureFile, "ActionDispatch::TestProcess::FixtureFile"],
  [() => m16.TestRequest, "ActionDispatch::TestRequest"],
  [() => m17.TestResponse, "ActionDispatch::TestResponse"],
]);
