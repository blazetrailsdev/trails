---
title: Active Storage Overview
description: Attaching files to Active Record models in Trails — configuring storage services, declaring one or many attachments, serving and transforming them, and testing with them.
---

# Active Storage Overview

> **See also:** [Guides index](./index.md) ·
> [Action Text Overview](./action-text-overview.md) ·
> [activestorage package](/packages/activestorage) ·
> [image-processing package](/packages/image-processing)

Active Storage stores uploaded files in a storage service and attaches them to
records. This guide covers:

- Configuring the services files are kept in.
- Declaring one or many attachments on a model.
- Serving files, and transforming or previewing them.
- Testing code that attaches files.

## What is Active Storage?

A file lives in a service, is described by an `ActiveStorage::Blob` row (its
key, filename, content type, byte size and checksum), and is joined to a
record through an `ActiveStorage::Attachment` row. A model declares an
attachment by name, and reading it answers an `Attached::One` or
`Attached::Many` that wraps those rows.

### Requirements

Image transformations run through the
[image-processing package](/packages/image-processing), which drives libvips
through the `wasm-vips` npm package or ImageMagick through the shelled
`mini-magick` port. PDF previews need `pdftoppm` (Poppler) or `mutool`
(MuPDF), and video previews and analysis need `ffmpeg` / `ffprobe` on the
`PATH`.

## Setup

`trails new` generates `config/storage.ts`, a module whose default export maps
a service name to its configuration, the shape Rails keeps in
`config/storage.yml`:

```ts
export default {
  local: { service: "Disk", root: "storage" },
  test: { service: "Disk", root: "tmp/storage" },
};
```

Each environment picks a service by name. A `config/storage/<env>.ts` file, if
present, is read in place of `config/storage.ts` for that environment.

<!-- typecheck:skip -->

```ts
// config/environments/development.ts
this.config.activeStorage.service = "local";
```

### Disk Service

`service: "Disk"` writes files under `root`, relative to the application.

### Mirror Service

`service: "Mirror"` keeps a `primary` and a list of `mirrors` in sync: reads go
to the primary, and uploads and deletes go to every service. It is the way to
move between services without downtime.

```ts
export default {
  local: { service: "Disk", root: "storage" },
  backup: { service: "Disk", root: "storage-backup" },
  mirrored: { service: "Mirror", primary: "local", mirrors: ["backup"] },
};
```

The S3, Azure and Google Cloud Storage services are not ported yet; the
[activestorage package page](/packages/activestorage) tracks what is.

### Public access

A service marked `public: true` serves files from permanent, unsigned URLs.
Every other service serves them through signed URLs that expire.

## Attaching Files to Records

### `hasOneAttached`

`hasOneAttached` declares a single attachment. Active Storage installs it on
Active Record models when it loads, so TypeScript sees it through a typed view
of the class, as the [activestorage package page](/packages/activestorage)
explains:

```ts
import { Base } from "@blazetrails/activerecord";
import type { One } from "@blazetrails/activestorage";

type HasAttached = {
  hasOneAttached(name: string, options?: object, block?: (attachable: never) => void): void;
  hasManyAttached(name: string, options?: object, block?: (attachable: never) => void): void;
};

export class User extends Base {
  declare avatar: One;

  static {
    (this as unknown as HasAttached).hasOneAttached("avatar");
  }
}

declare const user: User;
await user.avatar.attach({ io: "…", filename: "avatar.png", contentType: "image/png" });
user.avatar.isAttached(); // => true
```

Options include `service` (a configured service name, or a function of the
record), `dependent` (`"purge_later"` by default, or `false` to keep the file
when the record is destroyed) and `strictLoading`. A block declares named
variants, described under [Transforming Images](#transforming-images).

Reading an attachment loads it from the database, and a JavaScript property
read cannot wait on a query, so `isAttached` and the reads delegated to the
attachment raise until `await user.avatar.load()` has run. The
[package `CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/packages/activestorage/CLAUDE.md#method_missing-definers-in-this-package)
rules this.

### `hasManyAttached`

`hasManyAttached` declares a list. `attach` takes several attachables and
adds them; assigning the attribute replaces the list.

```ts
import { Base } from "@blazetrails/activerecord";
import type { Many } from "@blazetrails/activestorage";

type HasAttached = { hasManyAttached(name: string, options?: object): void };

export class Message extends Base {
  declare images: Many;

  static {
    (this as unknown as HasAttached).hasManyAttached("images");
  }
}

declare const message: Message;
declare const uploads: unknown[];
await message.images.attach(...uploads);
```

### Attaching File/IO Objects

An attachable is a signed blob id (what a form or direct upload submits), an
uploaded file from the request params, an existing blob, or an object with
`io`, `filename` and optionally `contentType` and `identify: false`.

### Replacing vs Adding Attachments

Assigning a `hasManyAttached` attribute replaces every attachment; `attach`
appends. To keep existing files through a form, submit their signed ids
alongside the new uploads.

### Form Validation

Attachments are uploaded when the record saves, not when they are assigned,
so a record that fails validation leaves nothing in the service. Assigning in
a form and calling `save` runs your model's validations first, as the
[Active Record Validations](./active-record-validations.md) guide describes.

## Removing Files

`purge` deletes the attachment, the blob and the file at once; `purgeLater`
does it from a `PurgeJob` on Active Job. Both exist on `One` and `Many`.

```ts
import type { One } from "@blazetrails/activestorage";

declare const avatar: One;
await avatar.purgeLater();
```

## Serving Files

### Redirect Mode

A blob's URL points at `ActiveStorage::Blobs::RedirectController`, which signs
a short-lived service URL and redirects to it. The route prefix is
`/trails/active_storage`, `rails` renamed `trails` as the
[naming conventions](https://github.com/blazetrailsdev/trails/blob/main/docs/ruby-ts-conventions.md)
spell it; `config.activeStorage.routesPrefix` changes it.

### Proxy Mode

`config.activeStorage.resolveModelToRoute = "trails_storage_proxy"` serves
files through the application instead, streaming them from the service via
`ActiveStorage::Blobs::ProxyController`. Proxy mode suits putting a CDN in
front of the app, since each URL is stable and cacheable.

### Authenticated Controllers

The built-in controllers are public to anyone holding a signed URL. To check
access, subclass `ActiveStorage::BaseController`, include `SetBlob` or
`Streaming`, authenticate in a `beforeAction`, and route your own path to it.

## Downloading Files

`blob.download()` answers the file's bytes, and `blob.open()` downloads to a
temporary file for code that needs a path.

## Analyzing Files

After upload, an `AnalyzeJob` reads metadata: dimensions for images (via vips
or ImageMagick), duration and dimensions for video, duration and bit rate for
audio. It lands in `blob.metadata`, with `analyzed: true` once done.

## Displaying Images, Videos, and PDFs

### Transforming Images

`variant` describes a transformation by the image-processing methods to apply.
Method names are camelCase, `resizeToLimit` for Ruby's `resize_to_limit`, as
the [package `CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/packages/activestorage/CLAUDE.md#a-variants-method-names-are-camelcase-imageprocessingtransformer)
rules. A named variant is declared with the attachment:

```ts
import { Base } from "@blazetrails/activerecord";

type Attachable = { variant(name: string, transformations: object): void };
type HasAttached = {
  hasOneAttached(name: string, options: object, block: (a: Attachable) => void): void;
};

export class User extends Base {
  static {
    (this as unknown as HasAttached).hasOneAttached("avatar", {}, (attachable) => {
      attachable.variant("thumb", { resizeToLimit: [100, 100] });
    });
  }
}
```

A variant is processed on first request and recorded, so later requests reuse
it. `preprocessed: true` processes it right after upload instead.
`config.activeStorage.variantProcessor` picks `"vips"` (the default) or
`"mini_magick"`.

### Previewing Files

Files that are not images, PDFs and videos, can be previewed: `preview`
extracts an image (the first page or a frame) and transforms it like a
variant. `representation` answers a variant for an image and a preview for
anything previewable, so one call covers both.

## Direct Uploads

Direct uploads send the file from the browser to the service, skipping the
application server. `DirectUploadsController` creates the blob and answers the
signed upload URL. The browser half, Rails' `activestorage.js`, is not
ported yet; the [activestorage package page](/packages/activestorage) tracks
it.

## Testing

### Discarding Files Created During Tests

Point the test environment at a Disk service under `tmp/`, as the generated
`config/storage.ts` does, and clear that directory after the suite.

### Adding Attachments to Fixtures

`ActiveStorage::FixtureSet`, exported at
`@blazetrails/activestorage/testing/fixture-set`, builds blob fixture rows:
`FixtureSet.blob({ filename, ... })` uploads a file from the fixtures
directory to the test service and answers the row's attributes, so
`active_storage_blobs` and `active_storage_attachments` fixtures can reference
it by label.

## Implementing Support for Other Cloud Services

A service is a subclass of `ActiveStorage::Service` implementing `upload`,
`download`, `downloadChunk`, `delete`, `deletePrefixed`, `isExist`, `url` and
`urlForDirectUpload`. `service: "<Name>"` resolves to the class named
`<Name>Service` in the package's service registry
(`packages/activestorage/lib/service/configurator.ts`), so a new service is
added there.
