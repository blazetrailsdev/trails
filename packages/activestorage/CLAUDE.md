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
`@inventedArm loadPath — PERMANENT`. Ruled by the repo owner on 2026-10-31.
