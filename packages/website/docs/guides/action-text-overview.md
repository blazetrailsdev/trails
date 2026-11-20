---
title: Action Text Overview
description: Rich text content in Trails — installing Action Text, adding rich text to a model, rendering it, the Trix editor, attachments through Active Storage and Signed GlobalIDs, and avoiding N+1 queries.
---

# Action Text Overview

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [actiontext package](/packages/actiontext)

Action Text stores and renders rich text: formatted paragraphs, links, lists,
and embedded images or records. After reading this guide you will know:

- How to install Action Text and give a model a rich text attribute.
- How to render rich text content and customise the editor.
- How attachments work, through Active Storage and Signed GlobalIDs.
- How to load rich text without N+1 queries.

## What is Action Text?

Action Text pairs the [Trix](https://trix-editor.org) editor in the browser
with a model on the server. The editor produces HTML; Action Text sanitises it
and stores it in an `ActionText::RichText` record that belongs to your model
polymorphically, so a model gains a rich text field without a new column.
Images and files dropped into the editor are uploaded through Active Storage
and stored in the HTML as `<action-text-attachment>` elements, which are
resolved back into records when the content is rendered.

## Installation

```sh
pnpm trails action_text:install
pnpm trails db:migrate
```

The installer adds the `trix` and `@rails/actiontext` npm packages and imports
them in the Vite entrypoint, copies the content layout and stylesheet, and
writes the migration for `action_text_rich_texts`. It also installs Active
Storage if the application does not have it. JavaScript goes through Vite
here, not importmap: see the root `CLAUDE.md` section "importmap-rails and
propshaft are out of scope".

## Creating Rich Text Content

`hasRichText` declares the attribute. It is installed on Active Record models
when Action Text loads, so TypeScript sees it through a typed view of the
class, as the [actiontext package page](/packages/actiontext) explains.

```ts
import { Base } from "@blazetrails/activerecord";

type HasRichText = { hasRichText(name: string, options?: object): void };

export class Article extends Base {
  declare content: unknown;

  static {
    (this as unknown as HasRichText).hasRichText("content");
  }
}
```

The options are `encrypted: true` (store the body with Active Record
encryption), `strictLoading` and `storeIfBlank: false` (do not create a
`RichText` row for an empty body).

In the form, `richTextarea` renders the Trix editor bound to the attribute:

```html
<%= formWith({ model: article }, (form) => { %> <%= form.label("content") %> <%=
form.richTextarea("content") %> <% }) %>
```

Permit the attribute in the controller like any other parameter:
`params.require("article").permit("title", "content")`.

## Rendering Rich Text Content

Outputting the attribute in a view renders it, inside the
`layouts/action-text/contents/_content.html.tse` layout, with every
attachment resolved. The body is sanitised when it is rendered.

For a plain-text version, such as a page title or an email preview,
`await article.content.toPlainText()` strips the markup and renders each
attachment as its caption or filename. Rendering an attachment can look a
record up by GlobalID, so `toPlainText` is async; `isBlank()` and
`isPresent()` read the result of the last one, as the
[actiontext package notes](/packages/actiontext) describe.

## Customizing the Rich Text Content Editor (Trix)

### Removing or Adding Trix Styles

The installer copies `app/assets/stylesheets/actiontext.css`, which imports
Trix's styles. Edit or replace it to change how the editor and the rendered
content look.

### Customizing the Editor Container

`app/views/layouts/action-text/contents/_content.html.tse` wraps every
rendered body in a `trix-content` element; change the wrapper there.

### Customizing HTML for Embedded Images and Attachments

`app/views/active-storage/blobs/_blob.html.tse` renders each uploaded file.
Edit it to change the markup of an embedded image or file link.

## Attachments

### Active Storage

A file dropped into the editor is uploaded directly to storage with Active
Storage's direct upload, and the content refers to the blob. The blob is
attached to the `RichText` record as one of its `embeds`, so it is purged with
the content.

#### Attachment Direct Upload JavaScript Events

The `@rails/actiontext` client emits the direct-upload events
(`direct-upload:start`, `:progress`, `:error`, `:end`) on the editor, so a
page can show progress or report a failure.

### Signed GlobalID

Any record can be embedded, not only files. A model that includes
`ActionText.Attachable` is serialised into the content by its Signed
GlobalID, which the server verifies before it loads the record, so a user
cannot embed a record by guessing its id.

```ts
import { Base } from "@blazetrails/activerecord";
import { Attachable } from "@blazetrails/actiontext";
import { include } from "@blazetrails/ruby-compat";

export class Person extends Base {}
include(Person, Attachable);
```

The browser inserts it as a Trix attachment whose `sgid` is the record's
`attachableSgid()`.

### Rendering an Action Text Attachment

An embedded record renders through its partial, by default
`app/views/people/_person.html.tse` for `Person`.

### Rendering a Different Partial for the action-text-attachment

Override `toAttachablePartialPath()` on the model to render a different
partial inside rich text than elsewhere in the application, and
`toTrixContentAttachmentPartialPath()` for how it looks inside the editor.

### Rendering a Partial for an Unresolved Instance or Missing action-text-attachment

When the record behind an attachment has been deleted, the attachment
renders `ActionText::Attachables::MissingAttachable`'s partial,
`action-text/attachables/_missing_attachable.html.tse`. Override that view
to change the placeholder.

### Attachable via API

A client that is not Trix can build the attachment element itself: an
`<action-text-attachment sgid="…">` element with the record's
`attachableSgid()`, inside the HTML it submits.

## Miscellaneous

### Avoiding N+1 Queries

Listing many records and rendering each one's rich text loads each
`RichText` separately. Preload them with the scope `hasRichText` defines:
`Article.withRichTextContent()` for one attribute, or
`withRichTextContentAndEmbeds()` to load the embedded blobs too.
`withAllRichText()` preloads every rich text attribute on the model.
