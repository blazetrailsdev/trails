# DidYouMean port plan

> **Status (2026-05-20):** Port shipped — `@blazetrails/did-you-mean` is its
> own workspace package (mirroring `@blazetrails/globalid`) with the barrel
> exporting `SpellChecker`, `Jaro`, `JaroWinkler`, and `Levenshtein`
> (classes; each numeric helper is a static — `Jaro.distance(a, b)` etc.).
> Verified via our `api:compare` extractor against the Ruby
> `did_you_mean/*` sources (3/3 files, 6/6 methods — see PRs #2076, #2078,
> #2095, #2099). Note: upstream Rails' own `api:compare` extractor does
> not scan `did_you_mean/*`; it lives in Ruby's stdlib, not Rails. Our
> extractor adds it as a separate package row because trails ports it.

## Consumers

Wired:

- `AbstractController::ActionNotFound#corrections` — #2079
- `ParameterMissing#corrections` (replaced inline Levenshtein ≤ 2) — #2097
- `UrlGenerationError#corrections` (replaced substring match) — #2100
- `AssociationNotFoundError` / `InverseOfAssociationNotFoundError` /
  `HasManyThroughAssociationNotFoundError` (replaced ad-hoc
  `levenshtein()` helpers in `associations.ts` + `reflection.ts`) — #2103

Remaining:

- `ActionView::Template::Error#corrections` — Rails calls raw
  `DidYouMean::Jaro.distance` (not `SpellChecker`). Maps directly to the
  exported `Jaro.distance` static; no new barrel symbol needed. ~80 LOC
  follow-up.

## Licensing / attribution

`did_you_mean` is MIT-licensed; `levenshtein.rb` further attributes the
algorithm to the Text gem ("Copyright (c) 2006-2013 Paul Battley, Michael
Neumann, Tim Fletcher"). Top-of-file attribution lives in
`packages/did-you-mean/src/levenshtein.ts` and `jaro-winkler.ts`; the
upstream MIT text + Text-gem copyright are in
`packages/did-you-mean/NOTICE`.
