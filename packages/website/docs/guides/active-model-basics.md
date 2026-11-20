---
title: Active Model Basics
description: Building model-like objects without a database in Trails — the API and Model modules, attributes, callbacks, conversion, dirty tracking, naming, secure passwords, serialization, translation and validations.
---

# Active Model Basics

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [activemodel package](/packages/activemodel) ·
> [Active Record Basics](./active-record-basics.md) ·
> [Active Record Callbacks](./active-record-callbacks.md)

Active Model is the set of building blocks Active Record is made from, offered
separately so a plain class can behave like a model: validate itself, track
changes, render as JSON and work with form helpers. This guide covers:

- The `API` module and the `Model` class.
- Declaring typed attributes and assigning them in bulk.
- Callbacks, conversion and dirty tracking.
- Naming, secure passwords, serialization, translation and validations.
- The lint tests that check an object is model-shaped.

## What is Active Model?

Not every model is a table. A contact form, a search query or an object read
from an external API still benefits from validations and from fitting into
controllers and views the same way a record does. Active Model gives you those
pieces one module at a time. Each one is mixed in with `include()` from
[activesupport](/packages/activesupport), the trails spelling of Ruby's
`include`, as
[`CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#module-mixins-ruby-include--typescript)
explains.

### API

`API` bundles what a form needs: attribute assignment from a hash,
validations, naming and conversion. A constructor that takes a hash comes with
it.

### Model

`Model` is a class that already includes `API`. Extending it is the shortest
route to a model-like object:

```ts
import { Model } from "@blazetrails/activemodel";

class EmailContact extends Model {
  declare name: string | null;
  declare email: string | null;

  static {
    this.validates("name", { presence: true });
  }
}

const contact = new EmailContact({ name: "Ada", email: "ada@example.com" });
await contact.isValid();
contact.isPersisted();
```

`isValid()` is awaited because a validator may do async work. Ruby's
`valid?` and `persisted?` become `isValid` and `isPersisted`, the predicate
spelling from the [naming conventions](https://github.com/blazetrailsdev/trails/blob/main/docs/ruby-ts-conventions.md).

### Attributes

Including `Attributes` adds typed attributes with defaults. Values are cast to
the declared type when written:

```ts
import { Model, Attributes, type AttributesClassHalf } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";

class Person extends Model {
  declare static attribute: AttributesClassHalf["attribute"];
  declare name: string | null;
  declare age: number | null;
  declare active: boolean;

  static {
    include(this, Attributes);
    this.attribute("name", "string");
    this.attribute("age", "integer");
    this.attribute("active", "boolean", { default: true });
  }
}

const person = new Person({ age: "42" });
person.age;
```

`person.age` reads `42`, a number. The reader is a property, not a method;
[`CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#generated-attribute-readers-are-properties-define_method_attribute)
records why.

#### Method: `attributeNames`

The class-level `attributeNames()` lists every declared attribute, in
declaration order.

#### Method: `attributes`

The instance-level `attributes` returns a plain object of names to current
values.

### Attribute Assignment

`assignAttributes` sets several attributes from one object. An unknown key
raises `UnknownAttributeError`, and parameters that were never permitted raise
`ForbiddenAttributesError`, which keeps raw request input out of a model:

```ts
import { Model } from "@blazetrails/activemodel";

class Person extends Model {
  declare name: string | null;
  declare email: string | null;
}

const person = new Person();
person.assignAttributes({ name: "Grace", email: "grace@example.com" });
```

#### Method alias: `attributes=`

Ruby's `attributes=` writer is the same operation as `assignAttributes`.

### Attribute Methods

`AttributeMethods` generates methods around each attribute from a prefix or a
suffix, such as `resetNameToDefault` or `nameShort`. You declare the pattern
once and implement one method that receives the attribute name.

#### Method: `aliasAttribute`

`aliasAttribute(newName, oldName)` makes a second name read and write the same
attribute, which helps when a column's name no longer fits.

### Callbacks

`Callbacks` adds `before`, `after` and `around` hooks to methods of your own.
`defineModelCallbacks` declares the events, and `runCallbacks` wraps the work:

```ts
import { Model } from "@blazetrails/activemodel";

class Person extends Model {
  static {
    this.defineModelCallbacks("update");
  }

  async update(): Promise<void> {
    await this.runCallbacks("update", () => {
      console.log("updating");
    });
  }
}
```

#### Defining Specific Callbacks

Pass `only` to declare a subset, such as `{ only: "after" }` or
`{ only: ["before", "around"] }`.

#### Defining Callbacks with a Class

A callback may be an object whose method is named after the event, such as
`afterCreate(record)`. One object can then serve several models.

#### Aborting Callbacks

A `before` callback stops the chain by calling `kernelThrow(":abort")` from
[ruby-compat](/packages/ruby-compat), the port of Ruby's `throw :abort`.
`runCallbacks` then skips the block and returns `false`.

### Conversion

`Conversion` gives an object the methods views and routes use to identify it.

#### toModel

`toModel()` returns the object itself, so code can always ask for "the model"
without checking what it was handed.

#### toKey

`toKey()` returns an array of the primary key's values, or `null` while the
object is not persisted.

#### toParam

`toParam()` joins the key into a string for URLs, or returns `null` while the
object is not persisted.

#### toPartialPath

`toPartialPath()` names the partial that renders the object, such as
`people/person`.

### Dirty

`Dirty` tracks which attributes changed since the object was loaded or last
saved. It needs `Attributes` too:

```ts
import { Model, Attributes, Dirty, type AttributesClassHalf } from "@blazetrails/activemodel";
import { include } from "@blazetrails/activesupport";

class Person extends Model {
  declare static attribute: AttributesClassHalf["attribute"];
  declare name: string | null;

  static {
    include(this, Attributes);
    include(this, Dirty);
    this.attribute("name", "string");
  }
}

const person = new Person();
person.name = "Ada";
```

After the assignment the object reports itself changed, and the per-attribute
readers report the old and new value of `name`.

#### Querying an Object Directly for its List of All Changed Attributes

`isChanged` is true once any attribute differs. `changed` lists the names of changed attributes, and `changes` maps each one to
its `[old, new]` pair. `changesApplied()` clears the record of changes, as a
save would, and moves them to `previousChanges`.

#### Attribute-based Accessor Methods

The generic forms take the attribute's name: `attributeChanged("name")`,
`attributeWas("name")`, `attributeChange("name")`,
`attributeWillChangeBang("name")` and `restoreAttributeBang("name")`. Dirty
also generates per-attribute forms from them through attribute method
suffixes, such as `nameChanged()`. A Ruby String cannot be changed in place in JS, so only
assignment marks a string attribute changed; the ruling is in
[`CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#ruby-strings-are-js-string-primitives-no-mutable-string-carrier).

### Naming

`Naming` adds a class-level `modelName`, which other parts of the framework
use to build route names, partial paths, form parameter keys and translation
keys:

```ts
import { Model } from "@blazetrails/activemodel";

class Person extends Model {}

Person.modelName.singular;
Person.modelName.plural;
Person.modelName.paramKey;
Person.modelName.routeKey;
Person.modelName.human();
```

#### Customize the Name of the Model

A model in a namespace can choose whether the namespace shows up in its
generated names, by having the namespace answer `isUseRelativeModelNaming()`.

### SecurePassword

`hasSecurePassword` stores a password as a bcrypt digest in a
`password_digest` attribute, adds `password` and `passwordConfirmation`
writers, and an `authenticate` method. It relies on
[bcrypt](/packages/bcrypt). The model needs `Attributes` so the digest has
somewhere to live; the activemodel test model `User` shows the full
declaration.

### Serialization

`Serialization` adds `serializableHash`, which builds a plain object from the
attributes. `only`, `except`, `methods` and `include` choose what goes in.

#### ActiveModel::Serializers::JSON

The JSON serializer, exported as `JSONSerializer`, adds `asJson` and
`fromJson` on top. The hash is both a plain object and awaitable, because an
`include` of an association may need a query; the dual shape is set out in
[activemodel's `CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/packages/activemodel/CLAUDE.md#serializations-dual-syncasync-hash-serializable_hash--as_json).

### Translation

`Translation` connects a model to [i18n](/packages/i18n).
`humanAttributeName("email")` looks up the attribute's display name under the
model's `i18nScope`, falling back to a humanized form of the name:

```ts
import { Model } from "@blazetrails/activemodel";

class Person extends Model {}

Person.humanAttributeName("first_name");
```

### Validations

`Validations` is part of `API`, so every `Model` has it. Declare rules with
`validates`, or write a method and register it with `validate`:

```ts
import { Model } from "@blazetrails/activemodel";

class Person extends Model {
  declare name: string | null;
  declare email: string | null;

  static {
    this.validates("name", { presence: true });
    this.validates("email", { format: { with: /@/ } });
  }
}

const person = new Person({ email: "nobody" });
await person.isValid();
person.errors.fullMessages;
```

#### Validation Methods and Options

`validatesPresenceOf`, `validatesLengthOf`, `validatesFormatOf` and the other
`validates*Of` helpers each take one kind of rule. Every rule accepts `on`,
`if`, `unless`, `allowNil`, `allowBlank`, `message` and `strict`.

#### Errors

`errors` is an `Errors` object. `add` records an error against an attribute,
`fullMessages` renders them all as sentences, and `messagesFor` returns one
attribute's messages.

### Lint Tests

`@blazetrails/activemodel/testing/lint` exports the `Tests` namespace, the checks that
an object behaves like a model: `toKey`, `toParam`, `toPartialPath`,
`isPersisted`, `modelName` and `errors`. Run them against your own class in a
test to confirm it will work wherever a model is expected.
