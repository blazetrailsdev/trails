/**
 * ActionDispatch::Assertions
 *
 * Aggregates the test assertions provided by ActionDispatch. Mirrors
 * Rails' `action_dispatch/testing/assertions.rb` — currently exports
 * ResponseAssertions; RoutingAssertions follow once
 * `RouteSet#recognize_path` / `#generate_extras` are ported.
 */

export {
  assertResponse,
  assertRedirectedTo,
  parameterize,
  normalizeArgumentToRedirection,
  type AssertionResponseHost,
  type AssertionResponseLike,
} from "./assertions/response.js";

// htmlDocument + RoutingAssertions methods follow once rails-dom-testing
// and RouteSet#recognize_path / #generate_extras are ported.
