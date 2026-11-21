---
title: Active Support Core Extensions
description: The Active Support helpers Rails adds to Ruby's core classes, as Trails ships them — imported free functions over native values, grouped by the class Rails extends.
---

# Active Support Core Extensions

> **See also:** [Guides index](./index.md) ·
> [Active Model Basics](./active-model-basics.md) ·
> [activesupport package](/packages/activesupport) ·
> [ruby-compat package](/packages/ruby-compat)

Rails reopens Ruby's `Object`, `String`, `Array`, `Hash` and the other core
classes to add methods such as `blank?`, `squish` and `index_by`. This guide
covers the same helpers in Trails, grouped by the class Rails adds them to:

- How to load them.
- The extensions to every object, to modules and classes, and to strings,
  numbers, enumerables, arrays, hashes, ranges, dates and times.

## How to Load Core Extensions

Trails does not touch `Array.prototype`, `String.prototype` or any other
native prototype. Each extension is a free function that takes the receiver as
its first argument, imported from `@blazetrails/activesupport`:

```ts
import { squish, isBlank } from "@blazetrails/activesupport";

squish("  hello \n  world "); // => "hello world"
isBlank("   "); // => true
```

`[1, 2].many?` in Ruby is `many([1, 2])` in Trails. The root
[`CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#core-extensions-are-not-installed-on-native-prototypes-configactive_supportbare)
rules this, and as a consequence `config.activeSupport.bare` changes nothing:
there is nothing to install. Where JavaScript already has the method
(`startsWith`, `includes`, `at`), use it; the helpers exist where Ruby's
behavior differs or JavaScript has no equivalent.

## Extensions to All Objects

### `isBlank` and `isPresent`

A value is blank when it is `null`, `undefined`, `false`, an empty or
whitespace-only string, or an empty array, object, `Map` or `Set`. Numbers are
never blank, `0` included, which is where these part ways with JavaScript
truthiness. An object that answers `isBlank()` itself decides for itself.

```ts
import { isBlank, isPresent } from "@blazetrails/activesupport";

isBlank(0); // => false
isBlank([]); // => true
isPresent("x");
```

### `presence`

`presence(x)` answers `x` if it is present and `null` otherwise, for
fallbacks: `presence(params.name) ?? "Anonymous"`.

### `isDuplicable` and `deepDup`

`deepDup` copies arrays and plain objects recursively, so the copy can be
changed without touching the original. `isDuplicable` answers whether a value
can be copied at all.

```ts
import { deepDup } from "@blazetrails/activesupport";

const original = { tags: ["a"] };
const copy = deepDup(original);
copy.tags.push("b"); // original.tags is still ["a"]
```

### `tryCall`

`tryCall(obj, "name", ...args)` calls a method only when the receiver is not
`null` and answers it, and answers `undefined` otherwise. Ruby's `try` is
spelled `tryCall` because `try` is a JavaScript keyword. For a known method,
optional chaining (`obj?.name()`) is the direct form.

### `toParam` and `toQuery`

`toParam` renders a value as a URL segment and `toQuery` as a query string,
with nested objects and arrays in Rails' bracket syntax:

```ts
import { toQuery } from "@blazetrails/activesupport";

toQuery({ page: 2, filter: { tag: "ts" } }); // => "filter%5Btag%5D=ts&page=2"
```

### `withOptions`

`withOptions(receiver, options, block)` merges the same options into every
call the block makes on its argument, for a run of declarations that share
them:

```ts
import { Base } from "@blazetrails/activerecord";
import { withOptions } from "@blazetrails/activesupport";

class Account extends Base {
  static {
    withOptions(this, { dependent: "destroy" }, (assoc) => {
      assoc.hasMany("customers");
      assoc.hasMany("products");
    });
  }
}
```

### `isIn`

`isIn(value, collection)` is `include?` turned around: whether `value` is in
the array, string or range. `presenceIn` answers the value or `null`.

## Extensions to `Module`

Rails' module macros are functions called with the class as `this`: `delegate` forwards
methods to another object, and `mattrAccessor` / `cattrAccessor` define
module- and class-level accessors.

```ts
import { delegate } from "@blazetrails/activesupport";

class Profile {
  name = "Ada";
}
class User {
  profile = new Profile();
}
delegate.call(User, "name", { to: "profile" });
```

## Extensions to `Class`

### Class Attributes

`classAttribute(klass, "name", { default })` defines a value that subclasses
inherit and may override without affecting the parent, the way Rails'
`class_attribute` does. The root
[`CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#module-mixins-ruby-include--typescript)
lists it among the mixin tools.

### Subclasses

`Class#subclasses` and `descendants` work, with one difference recorded in
the [activesupport `CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/packages/activesupport/CLAUDE.md#classsubclasses-is-seated-on-a-classs-first-own-write-callbacksclassmethodsset_callbacks):
JavaScript has no hook that fires when a subclass is defined.

## Extensions to `String`

### Output Safety

`htmlSafe(str)` marks a string as safe to render unescaped and answers a
`SafeBuffer`. Concatenating a plain string onto a `SafeBuffer` escapes it. Mark
only strings you built yourself, never user input.

### Filtering and Truncation

```ts
import {
  remove,
  squish,
  truncate,
  truncateWords,
  stripHeredoc,
  indent,
} from "@blazetrails/activesupport";

remove("Hello World", /o/); // => "Hell Wrld"
squish(" a \n b "); // => "a b"
truncate("Oh dear! Oh dear!", 10); // => "Oh dear..."
truncate("Oh dear! Oh dear!", 10, { separator: " " }); // => "Oh..."
truncateWords("Oh dear! Oh dear!", 2); // => "Oh dear!..."
stripHeredoc("    one\n    two\n"); // => "one\ntwo\n"
indent("a\nb", 2); // => "  a\n  b"
```

`truncateBytes` truncates to a byte size without splitting a character.

### `inquiry`

`inquiry.call("production")` answers an object whose `isProduction()` is `true`,
the shape `Trails.env` uses.

### Access

`at`, `from`, `to`, `first` and `last` take a position or a count:
`from("hello", 2)` is `"llo"`, `first("hello", 2)` is `"he"`.

### Inflections

The inflector turns words and identifiers between forms, by the rules in
`inflections()`:

```ts
import {
  pluralize,
  singularize,
  camelize,
  underscore,
  titleize,
  dasherize,
  humanize,
  parameterize,
} from "@blazetrails/activesupport";

pluralize("person"); // => "people"
singularize("octopi"); // => "octopus"
camelize("active_record"); // => "ActiveRecord"
underscore("ActiveRecord"); // => "active_record"
titleize("x-men: the last stand"); // => "X Men: The Last Stand"
dasherize("puni_puni"); // => "puni-puni"
humanize("author_id"); // => "Author"
parameterize("Donald E. Knuth"); // => "donald-e-knuth"
```

## Extensions to `Integer`

`ordinal(1)` is `"st"` and `ordinalize(1)` is `"1st"`.

### Time

`seconds`, `minutes`, `hours`, `days`, `weeks`, `months` and `years` build a
`Duration`, which moves a time forwards with `since` or backwards with `ago`:

```ts
import { days, hours } from "@blazetrails/activesupport";

days(2).ago();
hours(3).since();
```

## Extensions to `Enumerable`

These take any iterable, not only an array.

```ts
import {
  indexBy,
  indexWith,
  many,
  exclude,
  including,
  excluding,
  pluck,
  pick,
} from "@blazetrails/activesupport";

const people = [
  { id: 1, name: "Ada" },
  { id: 2, name: "Grace" },
];

indexBy(people, (p) => p.id); // id → person
indexWith(["a", "b"], (k) => k.length); // key → value
many(people); // => true, more than one element
exclude([1, 2], 3); // => true
including([1, 2], 3); // => [1, 2, 3]
excluding([1, 2, 3], 2); // => [1, 3]
pluck(people, "name"); // => ["Ada", "Grace"]
pick(people, "name"); // => "Ada"
```

`compactBlank`, `inOrderOf`, `sole`, `maximum`, `minimum` and `sum` are there
too.

## Extensions to `Array`

### Options Extraction

`extractOptionsBang(args)` removes a trailing plain object from an argument
list and answers it (`{}` when there is none), the way a Ruby method reads its
`**options` from `*args`.

### Conversions and Wrapping

```ts
import { toSentence, wrap } from "@blazetrails/activesupport";

toSentence(["one", "two", "three"]); // => "one, two, and three"
wrap(null); // => []
wrap([1]); // => [1]
wrap(1); // => [1]
```

### Grouping

```ts
import { inGroupsOf, inGroups, split } from "@blazetrails/activesupport";

inGroupsOf([1, 2, 3, 4, 5], 2); // => [[1, 2], [3, 4], [5, null]]
inGroups([1, 2, 3, 4], 2); // => [[1, 2], [3, 4]]
split([1, 2, 3, 4, 5], 3); // => [[1, 2], [4, 5]]
```

## Extensions to `Hash`

A Ruby Hash is a plain JavaScript object unless it needs a feature only a
`Hash` has, as the
[ruby-compat README](https://github.com/blazetrailsdev/trails/blob/main/packages/ruby-compat/README.md#when-a-ruby-hash-is-a-hash-and-when-it-is-an-object)
lays out, so these helpers take plain objects.

```ts
import { deepMerge, slice, deepTransformKeys } from "@blazetrails/activesupport";

deepMerge({ a: { b: 1 } }, { a: { c: 2 } }); // => { a: { b: 1, c: 2 } }
slice({ a: 1, b: 2, c: 3 }, "a", "c"); // => { a: 1, c: 3 }
deepTransformKeys({ a: { b: 1 } }, (k) => k.toUpperCase()); // => { A: { B: 1 } }
```

Ruby's `merge`, `except` and `key?` are the native spread, destructuring and
`in`. `HashWithIndifferentAccess` exists for code that mixes string and
Symbol keys, which a JavaScript object never has.

## Extensions to `Date`, `DateTime` and `Time`

Dates and times are the [date package](/packages/date) and Active Support's
`TimeWithZone`, built on `Temporal`. Their calculations (`beginningOfDay`,
`nextWeek`, `advance`, …) are methods on those classes rather than free
functions, because the receiver is a Trails class, not a native one.

## Extensions to `File`

`atomicWrite(path, block)` writes to a temporary file and renames it into
place, so a reader never sees a half-written file.

## Extensions to `NameError` and `LoadError`

Ruby's `NameError` and `LoadError` live in the
[ruby-compat package](/packages/ruby-compat), which is where Trails keeps
every Ruby core class it needs.
