# @blazetrails/actioncable

The server half of Action Cable, ported from the `actioncable` gem.

## Browser client

Rails' JavaScript client (`actioncable/app/javascript/action_cable/*.js`, its
compiled bundles and its JS test suite) is not ported: it is already
JavaScript. An application installs the published package directly:

```sh
npm install @rails/actioncable@~8.0.200
```

Use the release matching the vendored Rails version (Rails 8.0.2 publishes as
`8.0.200`). This package depends on it only for development, pinned to that
release in `package.json`, for the interop test in
`src/published-client.trails.test.ts`. When `vendor/rails` is bumped, move that
pin with it.
