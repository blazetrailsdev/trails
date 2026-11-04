# ruby-compat — Claude guide

Rules about `packages/ruby-compat` and its helpers. The repo-wide rules are in the
root [CLAUDE.md](../../CLAUDE.md). A `§ "…"` reference below names a section of
the root file unless it names one in this file.

## Native forms for Hash, Array and String calls

The tables applying root § "Ruby idioms that do not translate literally"'s
**Native first (RFC 0194)** rule. They bind in every package that calls a
ruby-compat helper, not only here.

### Hash calls on a plain object

Where the receiver is a plain object, write
the JS form and not the ruby-compat helper. The call gates credit the form on
the receiver Rails names, and `parity:api:calls:args` checks a literal key.

| Ruby                              | Native form                               | Keeps the helper where                                                                                                    |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `h.key?(:k)` / `has_key?`         | `"k" in h`; `Object.hasOwn(h, k)`         | the object can hold `{ k: undefined }` for an absent keyword                                                              |
| `h[k]` / `h[k] = v`               | `h[k]` / `h[k] = v`                       | a miss must read `null`; `k` is caller-supplied (`"__proto__"`, an `Object.prototype` name); a test asserts `FrozenError` |
| `h.delete(:k)`                    | `delete h.k`                              | the removed value is used, or a block is passed                                                                           |
| `h.merge!(other)` / `update`      | `Object.assign(h, other)`                 | a conflict block is passed                                                                                                |
| `h.merge(other)`                  | `{ ...h, ...other }`                      | a conflict block is passed; the result must have no prototype                                                             |
| `h.each_pair { \|k, v\| }`        | `for (const [k, v] of Object.entries(h))` | the call's return value is used                                                                                           |
| `h.fetch(:k, default)`            | `Object.hasOwn(h, "k") ? h.k : default`   | the key is computed; one argument (`KeyError`) or a block is passed                                                       |
| `delete_if`, `keep_if`, `replace` | none                                      | always                                                                                                                    |

`in` is for a literal key that is not an `Object.prototype` member name;
a computed or caller-supplied key is `Object.hasOwn(h, k)`, since `in` walks
the prototype chain and `"toString" in options` is true. Every row also keeps
the helper where the receiver may be a `Map`, a `Hash`, or an object that
answers the call itself (`isKey`, `get`, `set`, `each`), because the helper
dispatches and the form does not. A member call (`headers.hasKey(k)` for
`Rack::Headers#key?`) is a ported Rails method, not a helper, and stays.

### Array, String and Enumerable calls on a native value

The native-first rule,
for the receivers JS already has. `ruby-compat-native-required` enforces
each row once its sweep adds the helper to the JSON list; until then it
is enforced by review.

| Ruby                               | Native form                            | Keeps the helper where                                                        |
| ---------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| `a.first` / `a.last` (no argument) | `a[0] ?? null` / `a.at(-1) ?? null`    | the receiver may be an Enumerable or a `Range`; a count argument is passed    |
| `a.include?(x)`                    | `a.includes(x)`                        | equality must be Ruby `==` (`rbEqual`) on objects, not `SameValueZero`        |
| `a.map` / `a.select` / `a.reject`  | `a.map` / `a.filter` / `!` in filter   | the block result is read with Ruby truthiness (`0`, `""` are truthy in Ruby)  |
| `a.join(sep)`                      | `a.join(sep)`                          | an element is a nested Array: Ruby joins it with `sep`, JS with `","`         |
| `a.compact`                        | `a.filter((x) => x != null)`           | the in-place `compact!` and its `nil`-when-unchanged result                   |
| `a.each_with_index`                | `a.forEach((x, i) => …)` / `entries`   | the receiver may be any `each` receiver, or the enumerator result is used     |
| `s.start_with?` / `s.end_with?`    | `startsWith` / `endsWith`              | a Regexp or several prefixes are passed                                       |
| `s.include?(t)`                    | `s.includes(t)`                        | never, on a `string` receiver                                                 |
| `s.strip` / `upcase` / `downcase`  | `trim` / `toUpperCase` / `toLowerCase` | Ruby's whitespace set (`strip` keeps `\u00A0`) or ASCII-only case mapping     |
| `s.split(sep)`                     | `s.split(sep)`                         | trailing empty fields are dropped, a limit is passed, or `sep` is `nil`/`" "` |

Enumerable helpers are free functions taking the receiver first,
`partition(enum, fn)`, never a method spliced onto `Array.prototype`. Keep
one only where the receiver is not an Array (`each` receiver, `Range`,
`Set`) or where it reads its block with Ruby truthiness.
