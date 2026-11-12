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
