# Curation registers: per-site tags vs aggregate JSON

Which deviation registers live in JSDoc at a declaration, and which stay JSON
files under `scripts/`. RFC 0080 moved the per-declaration entries of
`extra-surface-allow.json` into `@noRailsEquivalent` (the tag family is
described in [api-build-stub-generation-plan.md](api-build-stub-generation-plan.md)).
This page records where every other register stands, so the "should this move
to JSDoc too?" question is answered once.

## The rule for any register

| Subject of an entry                   | Home                                        |
| ------------------------------------- | ------------------------------------------- |
| An aggregate over a package or file   | JSON. JSDoc has nowhere to hold a count.    |
| A fact about one TS declaration       | A tag in the existing family, at that site. |
| Anything that is not a TS declaration | JSON, whatever its granularity.             |

The tag family is `@noRailsEquivalent`, `@missingRailsCall`,
`@missingRailsArgs`, `@missingRailsName`, `@inventedArm` and `@inlinedFrom`
(see CLAUDE.md, "Before you open the PR"). A new per-site register joins that
family rather than inventing a new file.

## Inventory

| Register                                                                                           | Bucket                  | Status                                                                                         |
| -------------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `scripts/api-compare/extra-surface-mark.json`                                                      | Aggregate               | Stays JSON                                                                                     |
| `scripts/api-compare/extra-surface-internal-mark.json`                                             | Aggregate               | Stays JSON                                                                                     |
| `scripts/api-compare/{param-name,predicate-kind,arm-throw,block-param,ambiguous-parent}-mark.json` | Aggregate               | Stays JSON                                                                                     |
| `scripts/test-compare/assertion-mismatch-mark.json`                                                | Aggregate               | Stays JSON                                                                                     |
| `scripts/api-compare/call-mismatches-unreviewed/**`                                                | Aggregate               | Stays JSON                                                                                     |
| `scripts/schema-compare/invented-baseline.json`                                                    | Not a TS declaration    | Stays JSON (table names)                                                                       |
| `scripts/parity/unported-files/baseline.json`                                                      | Not a TS declaration    | Stays JSON (patterns over Ruby file paths)                                                     |
| `scripts/api-compare/body-pins.json`                                                               | Not a TS declaration    | Stays JSON (digests of Ruby bodies)                                                            |
| `scripts/api-compare/call-mismatches-exclude/**`                                                   | Per-site                | Migrating, review-then-migrate (below)                                                         |
| `scripts/api-compare/arity-exclude.json`, `inheritance-exclude.json`                               | Per-site, drained       | Deleted (`retire-drained-api-compare-registers`)                                               |
| `eslint/*-exclude.json`                                                                            | Per-site, out of family | Not chartered. ESLint's inline form is `eslint-disable-next-line -- <reason>`, not a JSDoc tag |

## `call-mismatches-exclude`: review, then migrate

A row moves to a `@missingRailsCall` / `@missingRailsArgs` tag only after a
person has written that row's reason. Bulk conversion is impossible:
`scripts/api-compare/missing-rails-call-tags.ts:20-46` makes a tag carrying
the RFC 0047 or RFC 0044 seed prose non-suppressing, and RFC 0083 forbids
`parity:api:build` from minting a tag with it. A mechanical sweep would
produce tags that suppress nothing, so the seeded rows would turn the gate red
the moment they left the JSON. Rows converge by deletion first; the ones that
stay are reviewed and moved one at a time.
