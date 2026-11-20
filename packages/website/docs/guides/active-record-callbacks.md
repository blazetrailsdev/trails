---
title: Active Record Callbacks
description: Hooking into a record's life cycle in Trails — registering callbacks, the order they run in on create, update and destroy, conditions, halting, skipping, and transaction callbacks.
---

# Active Record Callbacks

> **See also:** [Guides index](./index.md) ·
> [Active Record Basics](./active-record-basics.md) ·
> [Active Model Basics](./active-model-basics.md) ·
> [activerecord package](/packages/activerecord) · [activemodel package](/packages/activemodel)

A record goes through a series of steps between being built and being removed:
it is validated, saved, perhaps updated, and finally destroyed. Callbacks let
you run your own code at each of those steps. This guide covers:

- How to register a callback and which events exist.
- The order callbacks fire in when a record is created, updated or destroyed.
- Running a callback only when a condition holds.
- Stopping the chain, and the operations that skip callbacks entirely.
- Callbacks that wait for the surrounding transaction to commit.

## Object Life Cycle

Creating, updating and destroying a record each trigger a fixed sequence of
events. A callback is a function attached to one of those events. It receives
the record, may change it, and may return a promise, which Active Record
awaits before moving on.

## Callback Registration

Register callbacks in the model's `static {}` block. A callback is either a
function or the name of an instance method:

```ts
import { Base } from "@blazetrails/activerecord";

class User extends Base {
  declare login: string;
  declare email: string;

  static {
    this.beforeValidation("ensureLoginHasAValue");
    this.beforeSave((record) => {
      record.email = record.email.toLowerCase();
    });
  }

  ensureLoginHasAValue(): void {
    if (this.login == null || this.login === "") {
      this.login = this.email;
    }
  }
}
```

The method name is the camelCase name you gave the method, not a Ruby symbol.

### Registering Callbacks to Fire on Life Cycle Events

Pass `on` to limit a validation callback to a context, `"create"` or
`"update"`:

```ts
import { Base } from "@blazetrails/activerecord";

class User extends Base {
  declare login: string;

  static {
    this.beforeValidation(
      (record) => {
        record.login = record.login.trim();
      },
      { on: "create" },
    );
  }
}
```

## Available Callbacks

### Creating an Object

When a new record is saved, these run in order:

1. `beforeValidation`
2. `afterValidation`
3. `beforeSave`
4. `aroundSave`
5. `beforeCreate`
6. `aroundCreate`
7. `afterCreate`
8. `afterSave`
9. `afterCommit` / `afterRollback`

#### Validation Callbacks

`beforeValidation` is the place to normalize input; `afterValidation` can
inspect `errors` once the validators have run. Both come from
[activemodel](/packages/activemodel), so a plain Active Model class can use
them too.

#### Save Callbacks

Save callbacks run on every save, new record or not. An `around` callback gets
a `proceed` function and must call it for the save to happen:

```ts
import { Base } from "@blazetrails/activerecord";

class Order extends Base {
  static {
    this.aroundSave(async (_record, proceed) => {
      const started = Date.now();
      await proceed();
      console.log(`saved in ${Date.now() - started}ms`);
    });
  }
}
```

#### Create Callbacks

`beforeCreate`, `aroundCreate` and `afterCreate` run only the first time a
record is saved, inside the save callbacks.

### Updating an Object

Saving a persisted record runs the same sequence with the update callbacks in
place of the create ones: `beforeValidation`, `afterValidation`, `beforeSave`,
`aroundSave`, `beforeUpdate`, `aroundUpdate`, `afterUpdate`, `afterSave`, then
`afterCommit` / `afterRollback`.

#### Update Callbacks

```ts
import { Base } from "@blazetrails/activerecord";

class Order extends Base {
  declare status: string;

  static {
    this.afterUpdate((record) => {
      console.log(`order now ${record.status}`);
    });
  }
}
```

#### Using a Combination of Callbacks

Several callbacks on the same event run in the order they were registered.
Registering one `beforeSave` and one `afterUpdate` gives each a single job,
which is easier to read than one large callback with branches.

### Destroying an Object

`destroy` runs `beforeDestroy`, `aroundDestroy`, `afterDestroy`, then
`afterCommit` / `afterRollback`.

#### Destroy Callbacks

```ts
import { Base } from "@blazetrails/activerecord";

class Account extends Base {
  declare locked: boolean;

  static {
    this.beforeDestroy((record) => {
      if (record.locked) throw new Error("locked accounts cannot be removed");
    });
  }
}
```

### `afterInitialize` and `afterFind`

`afterInitialize` runs whenever a record object is built, whether by `new` or
by loading a row. `afterFind` runs only for loaded rows, before
`afterInitialize`:

```ts
import { Base } from "@blazetrails/activerecord";

class Account extends Base {
  static {
    this.afterFind(() => {
      console.log("loaded from the database");
    });
    this.afterInitialize(() => {
      console.log("object built");
    });
  }
}
```

### `afterTouch`

`touch` updates a record's timestamps without running save callbacks, and then
runs `afterTouch`. A `belongsTo` with `touch: true` touches the parent
whenever the child changes:

```ts
import { Base } from "@blazetrails/activerecord";

class Company extends Base {
  static {
    this.hasMany("employees");
    this.afterTouch(() => {
      console.log("a company was touched");
    });
  }
}

class Employee extends Base {
  static {
    this.belongsTo("company", { touch: true });
  }
}
```

## Running Callbacks

Callbacks run from `create`, `save`, `update`, `destroy`, `touch` and their
`Bang` forms, from `toggleBang` and `incrementBang`, and from `isValid`.
Finders that load records run `afterFind` and `afterInitialize`.

## Conditional Callbacks

`if` and `unless` take a method name, a function, or an array of either. The
callback runs only when every `if` passes and no `unless` does.

### Using `:if` and `:unless` with a `Symbol`

```ts
import { Base } from "@blazetrails/activerecord";

class Order extends Base {
  declare paidWithCard: boolean;

  static {
    this.beforeSave("normalizeCardNumber", { if: "isPaidWithCard" });
  }

  isPaidWithCard(): boolean {
    return this.paidWithCard;
  }

  normalizeCardNumber(): void {}
}
```

Where Rails names a method with a Symbol, trails passes its camelCase name as
a string.

### Using `:if` and `:unless` with a `Proc`

```ts
import { Base } from "@blazetrails/activerecord";

class Order extends Base {
  declare paidWithCard: boolean;

  static {
    this.beforeSave("normalizeCardNumber", {
      if: (record: Order) => record.paidWithCard,
    });
  }

  normalizeCardNumber(): void {}
}
```

### Multiple Callback Conditions

An array means every condition must hold. Mixing `if` and `unless` on one
callback works the same way:

```ts
import { Base } from "@blazetrails/activerecord";

class Comment extends Base {
  declare author: string | null;

  static {
    this.afterCreate("sendEmailToAuthor", {
      if: ["isAuthorWantsEmails", (record: Comment) => record.author != null],
      unless: "isSpam",
    });
  }

  isAuthorWantsEmails(): boolean {
    return true;
  }

  isSpam(): boolean {
    return false;
  }

  sendEmailToAuthor(): void {}
}
```

## Callback Objects

When several models share a callback, put it on an object with a method named
after the event. Active Record calls that method with the record:

```ts
import { Base } from "@blazetrails/activerecord";

const PictureFileCallbacks = {
  afterDestroy(record: Base): void {
    console.log(`removing files for ${String(record.id)}`);
  },
};

class PictureFile extends Base {
  static {
    this.afterDestroy(PictureFileCallbacks);
  }
}
```

## Halting Execution

Callbacks for one operation run inside its transaction. To stop a `before`
callback from letting the operation continue, call `kernelThrow(":abort")`
from [ruby-compat](/packages/ruby-compat), the port of Ruby's `throw :abort`.
The tag keeps its colon because it stands for a Ruby Symbol, as
[`CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#ruby-idioms-that-do-not-translate-literally)
rules.
`save` then returns `false`, the `Bang` forms raise `RecordNotSaved`, and the
transaction rolls back:

```ts
import { Base } from "@blazetrails/activerecord";
import { kernelThrow } from "@blazetrails/ruby-compat";

class Product extends Base {
  declare price: number;

  static {
    this.beforeSave((record) => {
      if (record.price < 0) kernelThrow(":abort");
    });
  }
}
```

Any other error thrown from a callback rolls the transaction back and
propagates to the caller.

## Skipping Callbacks

These write to the database without running callbacks, so use them with care:
`updateColumn`, `updateColumns`, `updateAll`, `deleteAll`, `delete`,
`insertAll`, `upsertAll`, `incrementCounter`, `decrementCounter` and
`touchAll`.

## Transaction Callbacks

### `afterCommit` and `afterRollback`

A record's after callbacks run before its transaction commits, so another
process cannot yet see the change. Work that must only happen once the row is
really written, such as enqueuing a job or sending a message, belongs in
`afterCommit`. `afterRollback` runs when the transaction is undone instead:

```ts
import { Base } from "@blazetrails/activerecord";

class PictureFile extends Base {
  static {
    this.afterCommit(
      () => {
        console.log("committed");
      },
      { on: "destroy" },
    );
    this.afterRollback(() => {
      console.log("rolled back");
    });
  }
}
```

### Aliases for `afterCommit`

`afterCreateCommit`, `afterUpdateCommit`, `afterSaveCommit` and
`afterDestroyCommit` are `afterCommit` with `on` already filled in:

```ts
import { Base } from "@blazetrails/activerecord";

class User extends Base {
  static {
    this.afterSaveCommit(() => {
      console.log("saved and committed");
    });
  }
}
```

### Transactional Callback Ordering

Transaction callbacks on one model run in the order they were defined, the
default in Rails 7.1 and later. Records changed in one transaction run their
callbacks once it commits, in the order the records were saved.
