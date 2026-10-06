# @blazetrails/msgpack

A port of Ruby's [`msgpack`](https://github.com/msgpack/msgpack-ruby) gem
(`vendor/msgpack/v1.8.0`), the gem `ActiveSupport::MessagePack` requires. The
gem's API is ported by name; [`@msgpack/msgpack`](https://github.com/msgpack/msgpack-javascript)
is the engine underneath, as `bcryptjs` is for `@blazetrails/bcrypt`.

The gem is a C extension, so each file mirrors both halves: `packer.ts` is
`lib/msgpack/packer.rb` plus `ext/msgpack/packer.c`, `packer_class.c` and
`packer_ext_registry.h`; `unpacker.ts` is `lib/msgpack/unpacker.rb` plus
`ext/msgpack/unpacker_class.c`; `buffer.ts` is `ext/msgpack/buffer_class.c`.

## Where a JS value differs from the Ruby one

- **Integer and Float.** A JS `number` has no Integer/Float distinction, so a
  whole `number` is a Ruby Integer, which is `rbObjClass`'s rule in
  `@blazetrails/ruby-compat`: `1.0` packs as `01` where the gem packs
  `cb3ff0000000000000`. To pack a whole number as a Float, pass the boxed
  `Number` ruby-compat reads as Float: `new Number(1)`. `-0` packs as `00`.
- **Integers past 2^53.** A `bigint` packs as the 64-bit Integer it is. An
  unpacked 64-bit Integer is a `number` wherever it is a safe one, else a
  `bigint`.
- **Strings.** A JS string packs as `str`; a `Uint8Array` is a binary String
  and packs as `bin`, and `Packer#toS` / `#fullPack` answer one.
- **Maps.** A plain object or a ruby-compat `Hash` packs as a map. A map
  unpacks as a plain object, so its keys are Strings or numbers.

## Where the port differs from the gem

Each is tracked by a story in RFC 0184.

- **A recursive ext type unpacks through a child unpacker.** The gem hands the
  proc the unpacker itself, still positioned in the stream
  (`ext/msgpack/unpacker.c:364-391`). The engine hands out the ext payload, so
  the proc gets an `Unpacker` over that payload carrying the same registry and
  frozen state.
- **`Unpacker#read` reads the engine's private `Decoder#pos`** to learn how
  many bytes one object consumed. Story:
  `msgpack-packer-unpacker-remaining-c-surface`.
- **A class registered on an object's singleton class is not found.**
  `msgpack_packer_ext_registry_lookup`
  (`ext/msgpack/packer_ext_registry.h:102-118`) looks up `rb_class_of` and then
  `rb_obj_class`; ruby-compat can create a singleton class but cannot ask
  whether an object has one, so only the real class is looked up. Story:
  `msgpack-class-inherited-p-singleton-lookup-and-cut-specs`.
- **`write_array_header` / `write_map_header` take an integer.** `NUM2UINT`'s
  `FloatDomainError` for `NaN` is not ported.
- **`StackError` is never raised**, unpacker options are ignored, IO-backed
  buffers are not wired, a map never unpacks as a `Hash`, and `Buffer#to_s` and
  the other C methods listed there are absent. Story:
  `msgpack-packer-unpacker-remaining-c-surface`.
- **`Factory`, `Factory::Pool` and `DefaultFactory`** are
  `msgpack-factory-pool-and-default-factory`.
