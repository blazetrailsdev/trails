# image-processing — Claude guide

Rules that bind only inside `packages/image-processing`. The repo-wide rules
are in the root [CLAUDE.md](../../CLAUDE.md), whose § "Runtime facts Node does
not expose" keeps a pointer to the section below.

## A wasm-vips `Image` is freed by `delete()` only

ruby-vips registers
libvips' tracked memory with Ruby's GC, so an unreferenced `Vips::Image` is
collected under memory pressure
(`vendor/image_processing/v1.14.0/lib/image_processing/processor.rb:11-35`).
wasm-vips 0.0.19 binds `Image` by raw pointer, and its embind glue registers
a handle with its `FinalizationRegistry` only when the handle holds a smart
pointer, so no `Image` is ever finalized; V8 cannot see the wasm heap either,
so a decode would not prompt a collection. Measured on trails#9710: each
4032×2688 transform kept ~34 MB until "vips_tracked: out of memory".
`Processor.call` and every `ImageProcessing::Vips` operation that supersedes
an intermediate it created deletes that intermediate, carrying
`@inventedArm delete — PERMANENT` (`deleteAccumulator` in `processor.ts`).
A handle the caller passed in is never deleted. Ruled by the repo owner on
2026-11-04.
