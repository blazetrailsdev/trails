# CLI: What's Left

All major CLI features are implemented. Remaining nice-to-haves:

- **Console**: currently connects to DB and loads models, but doesn't support
  awaiting async calls directly (Node REPL limitation). Could add top-level
  await support via a custom eval function.
- **`generate migration`**: could support polymorphic references
  (`user:references{polymorphic}`) and composite indexes.
- **`generate model`**: could support `--no-timestamps`, association
  declarations beyond `belongs_to`.
