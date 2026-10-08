# activesupport — Claude guide

Rules that bind only inside `packages/activesupport`. The repo-wide rules are in
the root [CLAUDE.md](../../CLAUDE.md), which keeps every heading below as a
pointer so code citations of the form `CLAUDE.md, "Section title"` resolve.

## `Class#subclasses` is seated on a class's first own write (`Callbacks::ClassMethods#set_callbacks`)

Rails' `DescendantsTracker#descendants`
(`activesupport/lib/active_support/descendants_tracker.rb:107-110`) is
`subclasses.concat(subclasses.flat_map(&:descendants))` over Ruby's native
`Class#subclasses`, so `__update_callbacks`
(`activesupport/lib/active_support/callbacks.rb:686-691`) reaches every subclass
with no registration step. JS keeps no subclass list, and the missing
`inherited` hook (root § "`inherited` is deferred to own-property memo guards")
means nothing can build one at definition time.

A subclass that has never written its own `__callbacks` reads its parent's
through the prototype chain, so it needs no edge. The first own write is where
it starts to diverge, so `setCallbacks` (`activesupport/src/callbacks.ts`)
registers the class and its superclass chain with
`DescendantsTracker.registerSubclass` there, a call `set_callbacks` does not
make. Without it Rails' `ResetCallbackTest` "reset impacts subclasses" is red.
An extra call has no JSDoc receipt shape, so this section is its receipt.

## Call-time constant resolution (activesupport, actionview, actionpack)

The activesupport inventory for root CLAUDE.md § "Call-time constant
resolution", which also covers the actionview and actionpack namespace objects
shaped the same way.

- `activesupport/src/namespaces.ts`, `actionview/src/namespaces.ts`,
  `actionpack/src/namespaces.ts` hold the `ActiveSupport`, `ActionView` and
  `ActionDispatch` namespace objects. Autoloaded and seated there:
  `ActionView.Base` (`action_view.rb:37`; read by `handlers/erb.rb:86`,
  `log_subscriber.rb:59`, `digestor.rb:39`); `ActionDispatch.Request`
  (`action_dispatch.rb:63`; read by `http/headers.rb:55`,
  `content_security_policy.rb:46`, `permissions_policy.rb:42`,
  `middleware/cookies.rb:705`); `ActionController.TestRequest`
  (`action_controller.rb:69-73`; read by `testing/assertions/routing.rb:315`),
  which breaks `assertions/routing.ts -> test-case.ts -> assertions.ts`, whose
  `mod.include(RoutingAssertions)` reads `RoutingAssertions` in TDZ when
  routing.ts is the entry module. Required rather than autoloaded, so seated
  with no `autoload` call: `ActiveSupport.BroadcastLogger` (`active_support.rb:30`,
  read at `logger.rb:21`) and `Attribute.UserProvidedDefault` on the class Rails
  nests it in (`attribute_registration.rb:5`).
- `TopLevel` in `activesupport/src/namespaces.ts` is Ruby's top-level `Object`,
  for a constant the reading gem does not depend on the defining gem for, or
  `::Rails` itself. The defining gem seats it: `TopLevel.Trails = Trails`
  (`trailties/src/rails.ts`), `TopLevel.ActionDispatch` /
  `TopLevel.ActionController` (`actionpack/src/namespaces.ts`), and
  `TopLevel.BCrypt` (`bcrypt/src/index.ts`; an unseated `BCrypt` is
  `has_secure_password`'s `LoadError` arm, `secure_password.rb:120-125`). A
  reader names it at call time: `TopLevel.Trails!.env` (`engine.rb:592`),
  `new TopLevel.ActionDispatch!.Request(env)` (`shard_selector.rb:41`,
  `database_selector.rb:64`), `TopLevel.ActionController!.Parameters` and
  `TopLevel.ActionDispatch!.Routing.PolymorphicRoutes.HelperMethodBuilder`
  (`routing_url_for.rb:92,109`). A read carries a guard only where Rails has a
  `defined?`: `TopLevel.Trails?.logger` (`deprecation/behaviors.rb:27`,
  `testing/tagged_logging.rb:23`, `log_subscriber.rb:94`) and
  `TopLevel.Trails !== undefined` (`action_controller/log_subscriber.rb:40`).
- `ActionView::RoutingUrlFor#url_for`'s `super` (`routing_url_for.rb:80-136`)
  is a real `super`: the `on_load(:action_controller)` hook (`railtie.rb:97-101`)
  includes UrlFor as a live `Module` whose link is spliced into
  `RoutingUrlFor`'s ancestry, because `include()` flattens a plain-object module
  beneath the class's own methods.
