# msgpack — Claude guide

Rules that bind only inside `packages/msgpack`. The repo-wide rules are in the
root [CLAUDE.md](../../CLAUDE.md).

## A read answers new bytes; the out String is not written (`Buffer#read`'s `out`)

`Buffer#read` and `#read_all` take an optional out String
(`vendor/msgpack/v1.8.0/ext/msgpack/buffer_class.c:430-533`), which the C
extension resizes in place and appends the read bytes to.
`_msgpack_buffer_read_from_io_to_string`
(`vendor/msgpack/v1.8.0/ext/msgpack/buffer.c:627-655`) reads straight into an
empty out String and copies through `io_buffer` otherwise.

An ASCII-8BIT String is a `Uint8Array` (root CLAUDE.md, "A String has no
encoding tag either"), and a `Uint8Array` cannot be resized. So the port
type-checks `out` with `CHECK_STRING_TYPE`, never writes it, and answers a new
`Uint8Array`; `readFromIoToString` has the one arm, the read answering its own
bytes. Ruled by the operator on 2026-11-12. This is a genuine language
shortcoming, and a new instance is not a new decision to argue.

## The unpacker is its own read loop (`read_primitive`)

`Unpacker` ports `read_primitive`, `msgpack_unpacker_read` and
`msgpack_unpacker_skip` (`vendor/msgpack/v1.8.0/ext/msgpack/unpacker.c:438-896`)
line for line, with the head byte, stack and partial raw body kept on the
instance as the C struct keeps them. It does not decode through
`@msgpack/msgpack`. The read state lives in one `uk` object, because a pool
freezes its unpackers and Ruby's `freeze` leaves the C struct writable. A map
reads as a plain object while every key is a String and becomes a `Hash` at the
first other key. Ruled by the operator on 2026-11-16, amending RFC 0184's
"no porting `ext/msgpack/*.c`" non-goal for the unpacker.

## A `:`-prefixed String packs as a Symbol (`Packer#write`'s `T_SYMBOL` arm)

A Ruby Symbol is a JS string with a leading colon (root CLAUDE.md), so
`Packer#write` takes the `T_SYMBOL` arm for every string `isSymbol` answers.
A call site that packs arbitrary text where Rails packs a String (`IPAddr#to_s`
in ActiveSupport's `write_ipaddr`) calls `writeString`, so `"::1"` keeps
Rails' str bytes. Ruled by the operator on 2026-11-16.
