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
  type RoutingAssertionsHost,
  type PathWithMethod,
} from "./assertions/routing.js";
// recognizedRequestFor / createRoutes / resetRoutes / failOn are @internal
// — they're still exported from ./assertions/routing.js so api:compare
// sees the full surface, but they aren't part of the public barrel.
