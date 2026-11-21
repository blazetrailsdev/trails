---
title: Active Record Validations
description: Declaring rules a record must satisfy before Trails saves it — the built-in validators, their common options, conditional and custom validations, and reading the errors they leave behind.
---

# Active Record Validations

> **See also:** [Guides index](./index.md) ·
> [Active Record Basics](./active-record-basics.md) ·
> [Active Record Callbacks](./active-record-callbacks.md) ·
> [Active Model Basics](./active-model-basics.md) ·
> [activerecord package](/packages/activerecord) ·
> [activemodel package](/packages/activemodel)

A validation is a rule a record has to pass before it reaches the database.
This guide covers:

- When validations run, and the calls that bypass them.
- The built-in validators and the options they share.
- Running a validation only under some condition.
- Writing your own validator classes and methods.
- Reading and adding to a record's errors.

## Validations Overview

```ts
import { Base } from "@blazetrails/activerecord";

class Person extends Base {
  declare name: string | null;

  static {
    this.validates("name", { presence: true });
  }
}

await Person.create({ name: "Grace" }).then((p) => p.isPersisted()); // => true
await Person.create({ name: null }).then((p) => p.isPersisted()); // => false
```

### Why Use Validations?

Validating in the model keeps each rule in one place, close to the data it
protects, and gives every caller the same error messages. Database
constraints are still worth having for guarantees a model cannot make alone,
such as uniqueness under concurrent writes; validations are what turn a bad
value into a message a user can act on.

### Validation Triggers

`create`, `save` and `update` run validations and refuse to write an invalid
record: `save` answers `false`, and the bang forms `createBang`, `saveBang` and
`updateBang` throw `RecordInvalid`. Ruby's `!` suffix becomes `Bang`, as the
[naming conventions](https://github.com/blazetrailsdev/trails/blob/main/docs/ruby-ts-conventions.md)
spell it.

```ts
import { Base, RecordInvalid } from "@blazetrails/activerecord";

class Person extends Base {
  static {
    this.validates("name", { presence: true });
  }
}

try {
  await Person.createBang({});
} catch (error) {
  if (error instanceof RecordInvalid) error.message; // => "Validation failed: Name can't be blank"
}
```

### Skipping Validations

Some calls write without validating: `insert` / `insertAll`, `upsert` /
`upsertAll`, `updateAll`, `updateColumn` / `updateColumns`, `updateAttribute`,
`touch`, and the counter helpers. `save` itself skips them when passed
`{ validate: false }`. Use these where you have already checked the data.

### Checking Validity

`isValid()` runs every validation and answers whether the record has no
errors; `isInvalid()` is its opposite. Both are awaited, because a validator
may query the database (uniqueness does).

```ts
import { Base } from "@blazetrails/activerecord";

class Person extends Base {
  static {
    this.validates("name", { presence: true });
  }
}

const person = new Person();
await person.isValid(); // => false
person.errors.get("name"); // => ["can't be blank"]
```

A freshly built record has an empty `errors` until something validates it.

## Validations

`validates` takes one or more attribute names and an options object, one key
per validator. The `validates*Of` helpers (`validatesPresenceOf`,
`validatesLengthOf`, …) each declare a single kind.

### `absence`

The attribute must be blank: `this.validates("legacyCode", { absence: true })`.

### `acceptance`

For a terms-of-service checkbox. It passes when the value is `true` or `"1"`,
and is skipped when the attribute is `null`; `accept` widens the accepted
values.

### `confirmation`

`this.validates("email", { confirmation: true })` adds a virtual
`emailConfirmation` attribute and requires the two to match. The check runs
only when the confirmation is not `null`, so pair it with a presence rule on
the confirmation.

### `comparison`

Compares the value with another value or attribute through
`greaterThan`, `greaterThanOrEqualTo`, `equalTo`, `lessThan`,
`lessThanOrEqualTo` and `otherThan`:

```ts
import { Base } from "@blazetrails/activerecord";

class Promotion extends Base {
  static {
    this.validates("endDate", { comparison: { greaterThan: "startDate" } });
  }
}
```

### `format`

Matches the value against a regular expression, `with` (must match) or
`without` (must not):

```ts
import { Base } from "@blazetrails/activerecord";

class Account extends Base {
  static {
    this.validates("subdomain", { format: { with: /^[a-z0-9-]+$/ } });
  }
}
```

### `inclusion` and `exclusion`

`inclusion: { in: [...] }` requires the value to be one of a list;
`exclusion: { in: [...] }` forbids it.

```ts
import { Base } from "@blazetrails/activerecord";

class Coffee extends Base {
  static {
    this.validates("size", { inclusion: { in: ["small", "medium", "large"] } });
    this.validates("subdomain", { exclusion: { in: ["www", "admin"] } });
  }
}
```

### `length`

Bounds the length with `minimum`, `maximum`, `in` (a two-element range) or
`is`. Each bound has its own message key (`tooShort`, `tooLong`,
`wrongLength`).

```ts
import { Base } from "@blazetrails/activerecord";

class Person extends Base {
  static {
    this.validates("name", { length: { minimum: 2, maximum: 50 } });
    this.validates("pin", { length: { is: 4 } });
  }
}
```

### `numericality`

Requires a number, optionally `onlyInteger`, with the same comparison keys as
`comparison` plus `odd`, `even` and `in`.

```ts
import { Base } from "@blazetrails/activerecord";

class Player extends Base {
  static {
    this.validates("points", { numericality: true });
    this.validates("gamesPlayed", { numericality: { onlyInteger: true } });
  }
}
```

### `presence`

The attribute must not be blank. Blank follows Active Support's
`isBlank`, so `""` and `"   "` fail as well as `null`. On an association it
checks that the associated record exists. For a boolean column use
`inclusion: { in: [true, false] }`, since `false` is blank.

### `uniqueness`

Checks the database for another row with the same value just before saving.
`scope` adds the columns that must also match, and `caseSensitive: false`
compares case-insensitively.

```ts
import { Base } from "@blazetrails/activerecord";

class Holiday extends Base {
  static {
    this.validates("name", { uniqueness: { scope: "year" } });
  }
}
```

Two concurrent saves can both pass this check; back it with a unique index.

### `validatesAssociated`

Validates the associated records too, and fails if any of them is invalid.
Declare it on one side of an association only, or the two sides recurse.

### `validatesEach`

Validates attributes with a function called once per attribute:

```ts
import { Base } from "@blazetrails/activerecord";

class Person extends Base {
  static {
    this.validatesEach(["name", "surname"], (record, attribute, value) => {
      if (typeof value === "string" && /^[a-z]/.test(value)) {
        record.errors.add(attribute, "must start with upper case");
      }
    });
  }
}
```

### `validatesWith`

Hands the record to a `Validator` subclass, whose `validate(record)` adds
errors directly:

```ts
import { Base } from "@blazetrails/activerecord";
import { Validator } from "@blazetrails/activemodel";

class GoodnessValidator extends Validator {
  validate(record: Base & { firstName?: string }): void {
    if (record.firstName === "Evil") {
      record.errors.add("base", "This person is evil");
    }
  }
}

class Person extends Base {
  static {
    this.validatesWith(GoodnessValidator);
  }
}
```

## Common Validation Options

### `allowNil` and `allowBlank`

`allowNil: true` skips the rule when the value is `null`; `allowBlank: true`
skips it when the value is blank.

### `message`

Replaces the default message, either with a string or with a function of the
record and the validation's data. A string may interpolate `%{value}`,
`%{attribute}` and `%{model}`.

```ts
import { Base } from "@blazetrails/activerecord";

class Person extends Base {
  static {
    this.validates("age", { numericality: { message: "%{value} is not a number" } });
  }
}
```

### `on`

Runs the rule only in a validation context. Records validate in `"create"`
when new and `"update"` when persisted; pass any other name to `isValid` or to
`save({ context })` to run your own:

```ts
import { Base } from "@blazetrails/activerecord";

class Person extends Base {
  static {
    this.validates("email", { uniqueness: true, on: "create" });
    this.validates("age", { numericality: true, on: "accountSetup" });
  }
}

await new Person().isValid("accountSetup");
```

### `strict`

`strict: true` raises `StrictValidationFailed` from Active Model instead of
adding an error.

## Conditional Validation

`if` and `unless` take a method name, a function of the record, or an array
of either; every condition must agree.

```ts
import { Base } from "@blazetrails/activerecord";

class Order extends Base {
  declare paymentType: string | null;

  isPaidWithCard(): boolean {
    return this.paymentType === "card";
  }

  static {
    this.validates("cardNumber", { presence: true, if: "isPaidWithCard" });
    this.validates("password", {
      confirmation: true,
      unless: (order: Order) => order.paymentType == null,
    });
  }
}
```

## Performing Custom Validations

### Custom Validators

Subclass `EachValidator` to write a rule reusable from `validates`. The class
name minus `Validator` is the option key, so `EmailValidator` answers
`email: true` once `validates` can find the class as a constant from the model, where it looks it up with `constGet`:

```ts
import type { Base } from "@blazetrails/activerecord";
import { EachValidator } from "@blazetrails/activemodel";

class EmailValidator extends EachValidator {
  validateEach(record: Base, attribute: string, value: unknown): void {
    if (typeof value !== "string" || !/^[^@\s]+@[^@\s]+$/.test(value)) {
      record.errors.add(attribute, (this.options.message as string) ?? "is not an email");
    }
  }
}
```

### Custom Methods

`validate` registers instance methods by name, or functions, which run with
every validation and add their own errors:

```ts
import { Base } from "@blazetrails/activerecord";

class Invoice extends Base {
  declare discount: number;
  declare totalValue: number;

  discountCannotBeGreaterThanTotalValue(): void {
    if (this.discount > this.totalValue) {
      this.errors.add("discount", "can't be greater than total value");
    }
  }

  static {
    this.validate("discountCannotBeGreaterThanTotalValue");
  }
}
```

## Working with Validation Errors

`errors` is an Active Model `Errors` collection of `Error` objects.

```ts
import { Base } from "@blazetrails/activerecord";

class Person extends Base {
  static {
    this.validates("name", { presence: true, length: { minimum: 3 } });
  }
}

const person = new Person();
await person.isValid();

person.errors.fullMessages; // => ["Name can't be blank", "Name is too short (minimum is 3 characters)"]
person.errors.get("name"); // messages for one attribute
person.errors.where("name", ":too_short"); // Error objects matching an attribute and type
person.errors.size; // => 2

person.errors.add("name", ":invalid"); // a type, translated through I18n
person.errors.add("base", "This person is invalid"); // a literal message, on the record as a whole

person.errors.clear();
```

A type is spelled with a leading colon (`":blank"`, `":too_short"`) because
Ruby passes a Symbol there and a string means a literal message; the
[root CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#ruby-idioms-that-do-not-translate-literally)
rules how a Ruby Symbol is spelled. `errors.details` maps each attribute to
the types and options it collected.

## Displaying Validation Errors in Views

Form helpers wrap a field with errors in `<div class="field_with_errors">`, so
a stylesheet can mark it. Render `errors.fullMessages` above the form to list
everything at once; the [Action View Helpers](./action-view-helpers.md) guide
covers the form builder.
