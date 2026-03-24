# CLI: What's Left

## Still needed

### Console with database connection

- Load database config and connect before starting REPL.
- Import and register all models from `src/app/models/`.
- Set the adapter on Base so queries work.
- Models should be available as globals in the REPL (e.g., `User.all()`).

### Generator improvements

- **`generate migration`** -- Support `AddIndexToUsers name:index`,
  `references` type, `belongs_to` shorthand.
- **`generate model`** -- Support `--no-migration`, `--no-test`,
  association declarations.
