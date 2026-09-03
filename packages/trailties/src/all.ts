/**
 * Port of `rails/all` (`railties/lib/rails/all.rb`) — the require list a
 * generated `config/application.ts` pulls in so that which framework
 * trailties a booted app runs is a statement in the app rather than an
 * accident of the module graph.
 *
 * Ruby wraps each `require` in `begin/rescue LoadError` (`all.rb:16-19`) so
 * an app whose Gemfile omits a framework still boots. Every trailtie module
 * named here lives in this package, and the frameworks they wire are
 * non-optional `dependencies` of `@blazetrails/trailties`, so the rescue arm
 * is unreachable: a static `import` cannot raise where Ruby's `require` can.
 *
 * Seven of the ten entries in `all.rb:5-16` have no trails counterpart yet —
 * `active_storage/engine`, `action_mailer/railtie`, `active_job/railtie`,
 * `action_cable/engine`, `action_mailbox/engine`, `action_text/engine` and
 * `rails/test_unit/railtie`. They join this list as those frameworks land.
 */

// `require "rails"` (`all.rb:3`) — `rails.rb:16-17` in turn requires the
// Active Support and Action Dispatch railties.
import "./rails.js";

import "./trailties/active-record.js";
import "./trailties/action-controller.js";
import "./trailties/action-view.js";
