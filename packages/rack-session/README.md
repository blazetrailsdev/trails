# @blazetrails/rack-session

A session implementation for Rack — the trails port of the `rack-session` gem.

`rack-session` is not part of the Rails monorepo. Its upstream is
[rack/rack-session](https://github.com/rack/rack-session), vendored at
`vendor/rack-session/` (RFC 0133), and it is the anchor for
ActionDispatch's session middleware the same way `vendor/rails/` is the anchor
for every framework package: `ActionDispatch::Session::CookieStore` subclasses
`Rack::Session::Abstract::Persisted`, so the base class has to exist as its own
port rather than as scaffolding inside actionpack.

## The contract

- **The vendored gem is the source of truth.** Read
  `vendor/rack-session/lib/rack/session/<file>.rb` before writing anything
  here, the same way every other package reads `vendor/rails/` first.
- **Every member cites its anchor.** A ported member carries a
  `vendor/rack-session/lib/rack/session/<file>.rb:LINE` citation, so a reviewer
  can put the Ruby and the TypeScript side by side.
- **Both parity gates run over it.** Unlike `date` and `minitest`, whose Ruby
  side is C or is not compared at all, `rack-session` is pure Ruby with a real
  test suite at `vendor/rack-session/test/` — so `parity:api` and `parity:test`
  both measure this package.
- **One workspace dependency, `@blazetrails/rack`.** The gemspec declares
  `rack >= 3.0.0` (`vendor/rack-session/rack-session.gemspec:24`) and the code
  uses `Rack::Request`, `Rack::Utils.set_cookie_header` and `Rack::Response`.
  Nothing else in the workspace may be depended on from here.

## Source layout

`src/**` mirrors `lib/rack/session/**` under the gem's module root, matching how
`packages/rack/src/**` mirrors `lib/rack/**`:

| gem                               | trails               |
| --------------------------------- | -------------------- |
| `lib/rack/session/abstract/id.rb` | `src/abstract/id.ts` |
| `lib/rack/session/cookie.rb`      | `src/cookie.ts`      |
| `lib/rack/session/pool.rb`        | `src/pool.ts`        |
| `lib/rack/session/encryptor.rb`   | `src/encryptor.ts`   |
| `lib/rack/session/constants.rb`   | `src/constants.ts`   |

The package is a scaffold today: `src/index.ts` exports nothing until
`relocate-rack-session-scaffolding-out-of-actionpack` moves the first member in.
