# activestorage — Claude guide

Rules that bind only inside `packages/activestorage`. The repo-wide rules, the
fidelity standard and the pre-PR checklist are in the root
[CLAUDE.md](../../CLAUDE.md), which also keeps every heading below as a
pointer so code citations of the form `CLAUDE.md, "Section title"` resolve.
A `§ "…"` reference below names a section of the root file unless it names
one in this file.

## A variant's method names are camelCase (`ImageProcessingTransformer`)

`supported_image_processing_methods` holds Ruby's names, which are also the
keys of a variant's transformation hash and the methods
`image_processing` dispatches. trails' option keys are camelCase, so
`ActiveStorage.supportedImageProcessingMethods` is the list in camelCase:
`validate_transformation`'s comparison stays exact (`image_processing_transformer.rb:54`),
`operations` pushes `[name, argument]` as written (`:45`), and `:38`'s
`"combine_options"` is `"combineOptions"`. A snake_case or hyphenated key is an
unsupported method. `process` awaits `ImageProcessing.loadPath[...]` where Ruby's
`autoload` loads inside `const_get` (`vendor/image_processing/v1.14.0/lib/image_processing.rb:10-11`),
the shape of § "An adapter file is loaded by an awaited step", and carries
`@inventedArm loadPath — PERMANENT`. Ruled by the operator on 2026-10-31.

## `method_missing` definers in this package

Class-specific rules under root § "Ruby protocol methods with a different JS
mechanism"; its cross-table rules and
[docs/method-missing-definers.md](../../docs/method-missing-definers.md) apply too.

- `active_storage/attached/one.rb`'s `attachment`, `blank?` and `attached?` are
  sync because the association lazily loads (`one.rb:32-34,44-46,73-75`), and
  a JS read cannot. `isAttached`, `isBlank` and a delegated read are sync and
  raise `RuntimeError` on an unloaded attachment until `await one.load()`, so
  activesupport's `isBlank(one)` never reads a promise. Ruled by the operator
  on 2026-10-31. `load` does not load the blob: a delegated blob read such as
  `filename` also needs `await (await one.attachment)?.blob`.
- `active_storage/attachment.rb`'s `delegate_missing_to :blob` is
  `delegateMissingTo` over a prototype, so its trap is synchronous. An unloaded
  `blob` is a promise that answers nothing: a forwarded name raises
  `NoMethodError` until `await attachment.blob`, where Rails' delegation loads
  it in line. `signed_id` needs only `blob_id`, so it signs that without a
  query. `Attachment` has no default scope. A nil `blob` raises
  `DelegationError`, as Rails does. `attached/one.rb`'s
  `delegate_missing_to :attachment, allow_nil: true` forwards only to a loaded
  attachment, as the entry above says. `attached/many.rb`'s `delegate_missing_to :attachments` needs no such
  guard: `attachments` is a collection proxy or the pending change's Array,
  and `then` is never forwarded, so awaiting a `Many` answers the `Many`.
