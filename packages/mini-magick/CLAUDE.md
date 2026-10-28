# mini-magick — Claude guide

Rules that bind only inside `packages/mini-magick`. The repo-wide rules are in
the root [CLAUDE.md](../../CLAUDE.md).

## `Image#==` and `#hash` compare a warm signature (`Image::Info#signature`)

`Image#==` and `#hash` (`vendor/mini_magick/v5.2.0/lib/mini_magick/image.rb:156-163`)
read `signature`, which `Image::Info#signature` memoizes from an `identify`
run in line (`image/info.rb:112-114`). In trails that run is a child process,
so it is awaited: `Info#signature` answers the memoized String once it has
been read, and a Promise before that.

`==` and `hash` are synchronous, because `rbEqual` / `rbHash` dispatch to them
synchronously and an `await` there would make every `Hash` or `uniq` holding an
image async. **They compare the signature as it stands.** An image whose
signature has never been read compares and hashes its pending Promise: `==` is
false against every other image, and `hash` is identity. A caller that needs
content equality awaits `image.signature()` on both images first, which is
the warm cache `==` then reads.

Ruled by the repo owner on 2026-10-28. `Image#equals` and `#hash` carry no
receipt: their bodies make exactly Rails' calls with Rails' arms, so no gate
flags them and no receipt tag applies, and a prose citation is stripped by
`no-freeform-comments`. This section is the record, and `image.trails.test.ts`
pins both arms.
