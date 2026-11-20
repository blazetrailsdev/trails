---
title: Action View Helpers
description: The helpers available in every Trails view — formatting numbers, dates and text, building links, tags and asset references, sanitizing input, and capturing and caching content.
---

# Action View Helpers

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [actionview package](/packages/actionview) ·
> [Action View Overview](./action-view-overview.md)

Helpers are the functions a template calls to turn data into markup. After
reading this guide you will know:

- How to format dates, numbers and text for display.
- How to build links, buttons and asset tags.
- How to sanitize user input and escape JavaScript.
- How to capture a block of markup, reuse it elsewhere, and cache it.

## Overview

Every helper listed here is in scope inside a `.tse` template without an import,
camelCased from its Rails name: `number_to_currency` is `numberToCurrency`,
`current_page?` is `isCurrentPage`. The helpers that need no view context, such
as the number and text formatters, are also exported from
`@blazetrails/actionview/helpers/index.js` for use in plain TypeScript.

## Formatting

### Dates

`distanceOfTimeInWords` describes the gap between two times in words, and
`timeAgoInWords` measures from now.

```ts
import { distanceOfTimeInWords, timeAgoInWords } from "@blazetrails/actionview/helpers/index.js";

const start = new Date("2026-01-01T00:00:00Z");
const end = new Date("2026-01-01T00:45:00Z");

distanceOfTimeInWords(start, end); // "about 1 hour"
timeAgoInWords(new Date(Date.now() - 3 * 60_000)); // "3 minutes"
```

### Numbers

The number helpers format a value for display and leave anything that is not a
number untouched.

```ts
import {
  numberToCurrency,
  numberToHuman,
  numberToHumanSize,
  numberToPercentage,
  numberToPhone,
  numberWithDelimiter,
  numberWithPrecision,
} from "@blazetrails/actionview/helpers/index.js";

numberToCurrency(1234567.89); // "$1,234,567.89"
numberToHuman(1234567); // "1.23 Million"
numberToHumanSize(1234567); // "1.18 MB"
numberToPercentage(100, { precision: 0 }); // "100%"
numberToPhone(1235551234); // "123-555-1234"
numberWithDelimiter(12345678); // "12,345,678"
numberWithPrecision(111.2345, { precision: 2 }); // "111.23"
```

Units, separators and currency symbols come from the current locale.

### Text

```ts
import { excerpt, pluralize, truncate, wordWrap } from "@blazetrails/actionview/helpers/index.js";

truncate("Once upon a time in a world far far away", { length: 17 }); // "Once upon a ti..."
pluralize(2, "person"); // "2 people"
excerpt("This is an example", "an", { radius: 5 }); // "...s is an exam..."
wordWrap("Once upon a time", { lineWidth: 8 }); // "Once\nupon a\ntime"
```

Inside a template, `simpleFormat` turns line breaks into `<p>` and `<br>` tags,
`highlight` wraps matched phrases in `<mark>`, and `cycle` alternates between
values on each call, which is handy for striped table rows.

## Links and URLs

These helpers need the routes and request of the current view, so they are
called from templates.

### button_to

`buttonTo` renders a one-button form, the safe way to trigger a non-`GET`
request:

```erb
<%= buttonTo("Delete", articlePath(this.article), { method: "delete" }) %>
```

### current_page?

`isCurrentPage` answers whether a URL or route options match the request being
rendered:

```erb
<% if (isCurrentPage(articlesPath())) { %>
<strong>Articles</strong>
<% } %>
```

### link_to

`linkTo` takes the link text and a destination: a path, a URL, route options or
a record.

```erb
<%= linkTo("All articles", articlesPath()) %>
<%= linkTo(this.article.title, this.article) %>
<%= linkTo(articlePath(this.article), { class: "card" }, () => { %>
  <h2><%= this.article.title %></h2>
<% }) %>
```

`linkToIf`, `linkToUnless` and `linkToUnlessCurrent` render the text alone when
their condition fails.

### mail_to

```erb
<%= mailTo("support@example.com", "Email us", { subject: "Help" }) %>
```

`phoneTo` and `smsTo` build `tel:` and `sms:` links the same way.

### url_for

`urlFor` turns route options, a record or a string into a URL, and is what the
link helpers call underneath:

```erb
<%= urlFor({ controller: "articles", action: "index" }) %>
```

## Sanitization

### sanitize

`sanitize` keeps an allowlist of tags and attributes and strips the rest. It is
the right tool for user-authored HTML you intend to display:

```erb
<%= sanitize(this.comment.body) %>
<%= sanitize(this.comment.body, { tags: ["strong", "em", "a"], attributes: ["href"] }) %>
```

The allowlist sanitizer is `@blazetrails/html-sanitizer`, the port of
`rails-html-sanitizer`.

### sanitize_css

`sanitizeCss` filters a CSS declaration list down to safe properties.

### strip_links

`stripLinks` removes `<a>` tags and keeps their text.

### strip_tags

`stripTags` removes every tag and keeps only text content.

## Assets

The asset helpers build the tags that reference images, scripts, stylesheets
and media. They resolve a bare name against the asset host and directory, and
know nothing about how assets are bundled: in a trails application JavaScript
and CSS are served by Vite, as ruled in
[`CLAUDE.md`, "importmap-rails and propshaft are out of scope"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#importmap-rails-and-propshaft-are-out-of-scope-javascript-is-served-by-vite-vite_rails),
whose tags come from the [vite-trails package](/packages/vite-trails).

### audio_tag

```erb
<%= audioTag("sound.wav", { controls: true }) %>
```

### auto_discovery_link_tag

```erb
<%= autoDiscoveryLinkTag("rss", articlesUrl({ format: "rss" })) %>
```

### favicon_link_tag

```erb
<%= faviconLinkTag() %>
```

### image_tag

```erb
<%= imageTag("logo.png", { alt: "Logo", size: "120x40" }) %>
```

### javascript_include_tag

```erb
<%= javascriptIncludeTag("https://cdn.example.com/widget.js", { defer: true }) %>
```

### picture_tag

`pictureTag` renders a `<picture>` with one `<source>` per format and an
`<img>` fallback.

```erb
<%= pictureTag("photo.webp", "photo.jpg", { image: { alt: "Photo" } }) %>
```

### preload_link_tag

```erb
<%= preloadLinkTag("fonts/inter.woff2") %>
```

### stylesheet_link_tag

```erb
<%= stylesheetLinkTag("print", { media: "print" }) %>
```

### video_tag

```erb
<%= videoTag("intro.mp4", { controls: true, poster: "intro.jpg" }) %>
```

## JavaScript

### escape_javascript

`escapeJavascript` (alias `j`) escapes quotes, newlines and `</` so a string
can sit inside a JavaScript literal.

```ts
import { escapeJavascript } from "@blazetrails/actionview/helpers/index.js";

escapeJavascript(`He said "hi"\n`); // 'He said \\"hi\\"\\n'
```

### javascript_tag

`javascriptTag` wraps code in a `<script>` tag, adding the page's
Content-Security-Policy nonce when asked with `{ nonce: true }`.

## Alternative Tags

### tag

`tag` builds any element. Call it with a name, or use the builder form, where
the element name is the method:

```erb
<%= tag.div("Hello", { class: "greeting", data: { controller: "hello" } }) %>
<%= tag.br() %>
```

Attribute objects nest: `data` and `aria` keys become `data-*` and `aria-*`
attributes.

### token_list

`tokenList` (alias `classNames`) joins strings and the keys of an object whose
values are true, which keeps conditional classes readable:

```ts
import { tokenList } from "@blazetrails/actionview/helpers/index.js";

tokenList("btn", { "btn-active": true, "btn-disabled": false }); // "btn btn-active"
```

## Capture Blocks

### capture

`capture` renders part of a template into a string instead of the output, so
it can be stored and placed later:

```erb
<% const greeting = capture(() => { %>
<p>Welcome back, <%= this.user.name %>.</p>
<% }) %>
<%= greeting %>
```

### content_for

`contentFor` stores markup under a name, and the layout renders it with
`yield`. A template can add to the page's `<head>` this way:

```erb
<% contentFor("head", () => { %>
<meta name="robots" content="noindex" />
<% }) %>
```

```erb
<head>
  <%= yield("head") %>
</head>
```

`isContentFor("head")` answers whether anything was stored, and `provide`
stores a value and stops further additions to that name.

## Performance

### benchmark

`benchmark` times a block and writes the message and elapsed milliseconds to
the log, at `info` level unless `level` says otherwise:

```erb
<% await benchmark("Rendered sidebar", async () => { %>
<%= render("sidebar") %>
<% }) %>
```

### cache

`cache` stores a rendered fragment in the configured cache store, keyed by its
argument and a digest of the template, and reuses it on the next render:

```erb
<% await cache(this.article, {}, async () => { %>
<%= render(this.article) %>
<% }) %>
```

`cacheIf` and `cacheUnless` cache conditionally. Unlike Rails, `cache` returns
a promise because reading a store may need I/O.

## Miscellaneous

### atom_feed

`atomFeed` is not ported yet.

### debug

`debug` renders an object as YAML inside a `<pre>` tag, a quick way to inspect
a value while building a page:

```erb
<%= debug(this.article) %>
```
