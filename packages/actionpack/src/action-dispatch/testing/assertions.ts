/**
 * ActionDispatch::Assertions — aggregates the test assertions provided by
 * ActionDispatch. Mirrors `action_dispatch/testing/assertions.rb`.
 * `htmlDocument` follows once rails-dom-testing is ported.
 */

export {
  assertResponse,
  assertRedirectedTo,
  parameterize,
  normalizeArgumentToRedirection,
  type AssertionResponseHost,
  type AssertionResponseLike,
} from "./assertions/response.js";

export {
  assertRecognizes,
  assertGenerates,
  assertRouting,
  withRouting,
  setup,
  createRoutes,
  resetRoutes,
  recognizedRequestFor,
  failOn,
  type RoutingAssertionsHost,
  type PathWithMethod,
} from "./assertions/routing.js";
