# Licensing

Trails uses two licenses, applied to different parts of the repository:

| Artifact                                                               | License   | File           |
| ---------------------------------------------------------------------- | --------- | -------------- |
| Source code (everything under `packages/*/src/`)                       | MIT       | `LICENSE`      |
| Scripts, configs, build tooling                                        | MIT       | `LICENSE`      |
| Auto-generated API reference (`packages/website/docs/api/`)            | MIT       | `LICENSE`      |
| Hand-written documentation prose under `packages/website/docs/guides/` | CC BY 4.0 | `LICENSE-docs` |
| Code examples embedded in documentation                                | MIT       | `LICENSE`      |

## Why two licenses

**MIT for code** is the standard permissive license for JavaScript/
TypeScript libraries. It lets anyone — including closed-source
commercial users — adopt Trails with minimal legal friction.

**CC BY 4.0 for docs** is the modern framework-documentation default
(MDN, Astro, Svelte, and many others). Creative Commons licenses are
designed for prose and media, rather than software — the legalese
parses properly for a tutorial page. CC BY 4.0 requires attribution
when the prose is reused elsewhere, but places no share-alike
constraint on derivative works, mirroring the permissiveness MIT
gives on code.

This is deliberately **not** the same split Rails uses (Rails Guides
are CC BY-SA 4.0). Share-alike has known friction with corporate
contributors and with most common doc licenses; CC BY avoids it while
keeping the attribution guarantee.

## What this means for contributors

- Code contributions are accepted under the MIT License.
- Documentation prose contributions are accepted under CC BY 4.0.
- Code examples inside documentation are MIT; the surrounding prose
  is CC BY 4.0. Copying an example from our docs into your own
  project is MIT-licensed; quoting the explanation around it requires
  attribution.

## What this means for reuse

- **Using Trails in your project:** MIT — do what you want.
- **Lifting documentation into your own project:** credit Trails, link
  to the license, indicate any changes. That's it — no share-alike
  obligation.
- **Copying from Rails Guides into ours:** don't. Rails Guides are
  CC BY-SA 4.0, which would force the entire Trails docs set onto
  that license. We use Rails Guides as a structural reference only
  (topic list, section order) and write prose from scratch. See
  `docs/rails-guides-migration-plan.md` for the operating rule.
