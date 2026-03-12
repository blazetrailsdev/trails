# Phase 900: CI, Publishing, Documentation

**Goal**: Make the packages production-ready and consumable.

## CI Improvements

### Database testing

- Add PostgreSQL service to CI (GitHub Actions)
- Add MySQL service to CI
- Run postgres/mysql adapter tests (currently 59 skipped)
- Add database migration tests against real DBs

### Quality gates

- Type checking (`tsc --noEmit`) in CI ✅ (already done)
- Test coverage thresholds
- Rails comparison report as CI artifact
- Fail CI if coverage regresses

## Package Publishing

### npm preparation

- Review `package.json` for each package (main, types, exports)
- Ensure `tsconfig.json` produces correct declaration files
- Add `files` field to limit published content
- Version management (consider changesets or similar)

### Registry

- Publish to npm under `@rails-ts/` scope
- Set up automated publishing from CI on tags/releases

## Documentation

### Per-package README

- Installation instructions
- Quick start examples
- API reference or link to Rails docs with notes on differences
- TypeScript-specific features (generics, type safety)

### Migration guide

- "Coming from Rails" guide
- Side-by-side code comparisons
- Known differences and limitations

### Website (stretch)

- API docs generated from TSDoc comments
- Interactive examples
