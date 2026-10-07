# @blazetrails/msgpack

A port of Ruby's [`msgpack`](https://github.com/msgpack/msgpack-ruby) gem
(`vendor/msgpack/v1.8.0`), the gem `ActiveSupport::MessagePack` requires. The
gem's API is ported by name; [`@msgpack/msgpack`](https://github.com/msgpack/msgpack-javascript)
is the engine underneath, as `bcryptjs` is for `@blazetrails/bcrypt`.

The gem is a C extension, so each file mirrors both halves: `packer.ts` is
`lib/msgpack/packer.rb` plus `ext/msgpack/packer.c`, `packer_class.c` and
`packer_ext_registry.h`; `unpacker.ts` is `lib/msgpack/unpacker.rb` plus
`ext/msgpack/unpacker_class.c`; `buffer.ts` is `ext/msgpack/buffer_class.c`;
`bigint.ts` and `symbol.ts` are `lib/msgpack/bigint.rb` and
`lib/msgpack/symbol.rb`.

## Where a JS value differs from the Ruby one

- **Integer and Float.** A JS `number` has no Integer/Float distinction, so a
  whole `number` is a Ruby Integer, which is `rbObjClass`'s rule in
  `@blazetrails/ruby-compat`: `1.0` packs as `01` where the gem packs
  `cb3ff0000000000000`. To pack a whole number as a Float, pass the boxed
  `Number` ruby-compat reads as Float: `new Number(1)`. A bare `-0` is a whole
  `number`, so it packs as `00`; `new Number(-0)` packs as the gem packs
  `-0.0`, `cb8000000000000000`. `rbObjClass` records why.
- **Integers past 2^53.** A `bigint` packs as the 64-bit Integer it is. An
  unpacked 64-bit Integer is a `number` wherever it is a safe one, else a
  `bigint`. One outside 64 bits raises `RangeError` unless an ext type is
  registered on `rbCInteger` with `oversizedIntegerExtension: true`, as
  `ActiveSupport::MessagePack` registers `MessagePack.Bigint`.
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
- **A Symbol packs as the String it is carried by.** `rbObjClass` reads a
  `":name"` string as a String, so an ext type registered on `rbCSymbol` is
  never looked up when packing, and `Factory#register_type` has no Symbol arm
  (`ext/msgpack/factory_class.c:232-239`). `symbol.ts`'s
  `Symbol.from_msgpack_ext` unpacks one. Story:
  `msgpack-symbol-ext-packer-arm-and-extended-object-lookup`.
- **An ext type registered on a `Uint8Array` subclass is not found.**
  `rbObjClass` reads every `Uint8Array` as a plain String, where
  `rb_class_of` answers a String subclass (`ext/msgpack/packer.c:174-178`), so
  the value packs as `bin`. Story:
  `rb-obj-class-reads-a-uint8array-subclass-as-plain-string` (RFC 0154).
- **`write_array_header` / `write_map_header` take an integer.** `NUM2UINT`'s
  `FloatDomainError` for `NaN` is not ported.
- **`StackError` is never raised**, unpacker options are ignored, IO-backed
  buffers are not wired, a map never unpacks as a `Hash`, and the C methods listed
  there are absent. Story:
  `msgpack-packer-unpacker-remaining-c-surface`.
- **`Factory#dup` does not carry `oversized_integer_extension`**, because
  `Factory_dup` (`ext/msgpack/factory_class.c:111-123`) does not copy
  `has_bigint_ext_type`. `Factory#pool` dups an unfrozen factory, so freeze the
  factory first, as the gem needs too.
- The `factory_spec.rb` tests still unported are
  `msgpack-factory-spec-remaining-tests`.
