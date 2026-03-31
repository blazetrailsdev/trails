# ActiveModel API Compare: Road to 100%

Current state: **94.5%** (86/91 classes/modules). **100%** tests (963/963). Target: 100% API.

```bash
pnpm run api:compare -- --package activemodel
```

Only 5 classes/modules remain. Zero misplaced.

---

## Remaining (5 missing)

| Rails file                     | Missing | Notes                                                         |
| ------------------------------ | ------- | ------------------------------------------------------------- |
| `attribute_registration.rb`    | 1       | AttributeRegistration module — attribute lifecycle hooks      |
| `callbacks.rb`                 | 1       | Callbacks top-level module export (implementation exists)     |
| `translation.rb`               | 1       | Translation module — i18n integration for model names         |
| `type/serialize_cast_value.rb` | 1       | SerializeCastValue (1 of 2 matched)                           |
| `validations/callbacks.rb`     | 1       | Validations::Callbacks module — before/after validation hooks |

Most of these are likely already implemented but not exported from the
correct file path. Check if the functionality exists in `base.ts` or
similar and just needs a re-export.

---

## Milestones

| Target         | Status                           |
| -------------- | -------------------------------- |
| **75%** (~68)  | ✅                               |
| **85%** (~77)  | ✅                               |
| **94.5%** (86) | ✅ Current                       |
| **100%** (91)  | 5 remaining — likely a single PR |
