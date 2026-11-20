---
title: Active Record Encryption
description: Encrypting attributes at the application level in Trails — configuring keys, declaring encrypted attributes, deterministic encryption and querying, previous schemes, key providers, the record API and encryption contexts.
---

# Active Record Encryption

> **See also:** [Guides index](./index.md) ·
> [Active Record Basics](./active-record-basics.md) ·
> [activerecord package](/packages/activerecord)

Active Record can encrypt chosen attributes before they are written and decrypt
them when they are read. Your code works with plain values; the database, its
backups and its logs only ever see ciphertext. This guide covers:

- Configuring encryption keys.
- Declaring encrypted attributes, and the choice between deterministic and
  non-deterministic encryption.
- Querying, uniqueness, fixtures and unencrypted legacy data.
- Rotating keys and changing schemes without rewriting every row.
- Key providers, the record-level API and encryption contexts.

## Why Encrypt Data at the Application Level?

Database-level and disk-level encryption protect data at rest, but anyone who
can run a query, read a dump or see a log line still sees the plain values.
Encrypting in the application narrows that: a value is readable only by code
that holds the keys. It also lets you mark sensitive columns explicitly,
which keeps them out of logs and console output.

## Basic Usage

### Setup

Encryption needs a primary key, a deterministic key and a key derivation salt.
Generate long random strings for each, keep them in your credentials, and hand
them to `Encryption.configure` during boot:

```ts
import { ActiveRecord } from "@blazetrails/activerecord";

ActiveRecord.Encryption.configure({
  primaryKey: "EGY8WhulUOXixybod7ZWwMIL68R9o5kC",
  deterministicKey: "aPA5XyALhf75NNnMzaspW7akTfZp0lPY",
  keyDerivationSalt: "xEY0dt6TZcAMg52K7O84wYzkjvbA62Hz",
});
```

`primaryKey` may be an array: the last key encrypts new data and every key is
tried when decrypting, which is how keys are rotated (see
[Rotating Keys](#rotating-keys)).

### Declaration of Encrypted Attributes

Call `encrypts` in the model's `static {}` block with the attribute names:

```ts
import { Base } from "@blazetrails/activerecord";

class Article extends Base {
  declare title: string;

  static {
    this.encrypts("title");
  }
}

const article = await Article.create({ title: "Encrypt it all!" });
article.title; // => "Encrypt it all!"
```

The column holds a JSON payload carrying the ciphertext and headers, so it
needs more room than the plain value: allow roughly 255 bytes of overhead for
short strings, and use `text` columns for long ones. When
`validateColumnSize` is on (the default), a value whose ciphertext would not
fit fails validation instead of being truncated by the database.

### Deterministic and Non-deterministic Encryption

By default encryption is non-deterministic: the same value encrypts to a
different ciphertext every time, so equal values cannot be spotted by looking
at the column. The cost is that the column cannot be queried.

Pass `deterministic: true` when you need to look records up by the value.
Equal values then produce equal ciphertext, so `where` and `findBy` work:

```ts
import { Base } from "@blazetrails/activerecord";

class Author extends Base {
  declare email: string;

  static {
    this.encrypts("email", { deterministic: true, downcase: true });
  }
}

const author = await Author.findBy({ email: "someone@example.com" });
```

Use deterministic encryption only where you actually query, since it reveals
which rows share a value.

## Features

### Fixtures

With `Encryption.config.encryptFixtures` set, fixture values for encrypted
attributes are encrypted as the fixtures load, so fixture files can hold plain
values. Fixtures may be YAML or `.ts` modules
([packages/activerecord/CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/packages/activerecord/CLAUDE.md#fixtures-load-from-ts-modules-as-well-as-yaml-fixturesetfile)).

### Supported Types

Encryption works on string values, and on binary values held as
`Uint8Array`. A serialized attribute is encrypted after serialization, so
declare `serialize` before `encrypts`.

### Ignoring Case

`downcase: true` lower-cases the value before encrypting, so queries match
regardless of case but the original case is lost. `ignoreCase: true` keeps the
original value in an `original_<name>` column and queries the lower-cased one.

### Support for Unencrypted Data

While migrating existing columns, set `supportUnencryptedData` (globally on
`Encryption.config`, or per attribute) so rows that still hold plain values
are read as they are instead of raising a decryption error. Turn it off once
every row is encrypted.

### Support for Previous Encryption Schemes

Changing the encryption options, for example switching from
non-deterministic to deterministic, would make existing rows unreadable. List
the old options under `previous` when configuring, and reads fall back to
them:

```ts
import { ActiveRecord } from "@blazetrails/activerecord";

ActiveRecord.Encryption.configure({
  primaryKey: "EGY8WhulUOXixybod7ZWwMIL68R9o5kC",
  deterministicKey: "aPA5XyALhf75NNnMzaspW7akTfZp0lPY",
  keyDerivationSalt: "xEY0dt6TZcAMg52K7O84wYzkjvbA62Hz",
  previous: [{ deterministic: false }],
});
```

Deterministic queries also match ciphertext produced by previous
deterministic schemes, so lookups keep finding older rows.

### Unique Constraints

A uniqueness validation on a deterministic attribute compares ciphertext, and
takes previous schemes into account. A unique index works the same way, as
long as every row was encrypted with the same deterministic scheme.

### Filtering Params Named as Encrypted Columns

Encrypted attribute names are added to the application's filter parameters,
so their values are masked in logs. `excludedFromFilterParameters` lists
attributes to leave out, and `addToFilterParameters: false` turns the
behaviour off.

### Compression

Values are compressed before encryption when that makes them smaller. Pass
`compress: false` to skip it, or `compressor` to use your own object
answering `deflate` and `inflate`.

## Key Management

### Built-in Key Providers

`DerivedSecretKeyProvider` derives keys from the configured passwords with the
key derivation salt; it is the default. `EnvelopeEncryptionKeyProvider`
generates a fresh data key for every encryption and stores it, encrypted with
the primary key, alongside the data.

### Custom Key Providers

A key provider is any object answering `encryptionKey()` and
`decryptionKeys(message)`. Pass one as `keyProvider` to `encrypts`, or set it
on the configuration to use it everywhere.

### Attribute-specific Keys

`key: "some secret"` on `encrypts` derives that attribute's key from its own
password instead of the primary key.

### Rotating Keys

Add the new key to the end of `primaryKey` and keep the old ones before it.
New data is encrypted with the last key, and every listed key is tried on
read. Once every row has been re-encrypted, the old key can be dropped.
Setting `storeKeyReferences` records which key encrypted each value, so
decryption goes straight to it instead of trying each in turn.

## API

### Basic API

```ts
import { Base } from "@blazetrails/activerecord";

class Article extends Base {
  static {
    this.encrypts("title");
  }
}

const article = (await Article.first()) as Article;
await article.encrypt(); // re-encrypt every encrypted attribute and save
await article.decrypt(); // write the plain values back
article.ciphertextFor("title"); // the stored ciphertext
article.isEncryptedAttribute("title"); // => true
```

## Configuration

### Configuration Options

The options live on `Encryption.config` and are camelCase:
`supportUnencryptedData`, `extendQueries`, `encryptFixtures`,
`storeKeyReferences`, `addToFilterParameters`,
`excludedFromFilterParameters`, `validateColumnSize`, `primaryKey`,
`deterministicKey`, `keyDerivationSalt`,
`forcedEncodingForDeterministicEncryption`, `hashDigestClass` and
`compressor`.

### Encryption Contexts

A context bundles the encryptor, key provider and message serializer in use.
The `Contexts` helpers run a block under a different one. Each block gets a
context of its own even when several run concurrently, as
[CLAUDE.md](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#a-thread-local-block-stack-forks-per-async-block-isolatedexecutionstatefork)
records:

- `withEncryptionContext(properties, block)` overrides chosen properties.
- `withoutEncryption(block)` reads and writes ciphertext untouched.
- `protectingEncryptedData(block)` reads ciphertext but refuses to overwrite
  encrypted attributes, which suits a console on production data.
