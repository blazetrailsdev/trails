---
title: Action View Overview
description: How a Trails application renders HTML — TSE templates, Builder, template compilation, partials, locals, collections and partial layouts.
---

# Action View Overview

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [actionview package](/packages/actionview) ·
> [Action View Helpers](./action-view-helpers.md) ·
> [Action Controller Overview](./action-controller-overview.md)

Action View is the V in a Trails application: it turns the data a controller
gathered into the body of a response. After reading this guide you will know:

- What templates are, how they are named and which languages they are written in.
- How trails compiles templates before your application runs.
- How to split a view into partials and pass data into them.
- How to render a collection, and how to wrap partials in a layout.

## What is Action View?

A controller action decides _what_ to show; Action View decides _how_. Each
action has a template under `app/views/<controller>/`, and Action Pack renders
it at the end of the action unless the action rendered or redirected itself.
Templates read the controller's state, call helpers, render partials, and are
wrapped in a layout from `app/views/layouts/`.

## Using Action View with Trails

Running `pnpm trails generate scaffold article title:string body:text` creates
`app/views/articles/` with one template per action:

```sh
app/views/articles/
├── _article.html.tse
├── _form.html.tse
├── edit.html.tse
├── index.html.tse
├── new.html.tse
└── show.html.tse
```

A template's name has three parts: the action (`show`), the format it produces
(`html`) and the handler that compiles it (`tse`). File names are kebab-case,
so an action called `bulkEdit` is rendered from `bulk-edit.html.tse`.

## Templates

### TSE

TSE is trails' spelling of ERB: the same `<% %>` and `<%= %>` tags, with
TypeScript inside them instead of Ruby. `<% %>` runs code; `<%= %>` runs code
and writes the HTML-escaped result. A trailing `-%>` drops the newline after
the tag.

```html
<h1>Articles</h1>
<ul>
  <% for (const article of this.articles) { %>
  <li><%= linkTo(article.title, article) %></li>
  <% } %>
</ul>
```

Values the controller set on `this` are read as `this.articles`, the TSE form of
Rails' `@articles`. Helpers such as `linkTo` are in scope without an import.

### Jbuilder

Jbuilder is not ported. A JSON response is usually built in the controller with
`render({ json: ... })`.

### Builder

Templates ending in `.builder` produce XML through `@blazetrails/builder`, the
port of the `builder` gem. Each method call on `xml` emits an element, and a
trailing function supplies its children:

```js
xml.rss({ version: "2.0" }, () => {
  xml.channel(() => {
    xml.title("Recent articles");
    for (const article of this.articles) {
      xml.item(() => xml.title(article.title));
    }
  });
});
```

A tag whose name the builder object already answers, such as `constructor`, is
written `xml.tagBang("constructor")`, Ruby's `tag!`.

### Template Compilation

Rails compiles a template into a Ruby method the first time it is rendered.
JavaScript cannot do that without `eval`, so trails compiles every `.tse` file
ahead of time: `trails-tsc-views build` writes a type-checked module for each
template into `.trails/views/`, and rendering loads it from there. A template
with no built module raises `LoadError`. The ruling and the build pipeline are
described in
[actionview's `CLAUDE.md`](https://github.com/blazetrailsdev/trails/blob/main/packages/actionview/CLAUDE.md#templates-are-precompiled-templatecompiles-module_eval).
One consequence: `render({ inline: "..." })` and other string-source templates
are not supported.

## Partials

A partial is a template whose file name starts with an underscore. It is
rendered from another template and returns a fragment of HTML.

### Rendering Partials

```html
<%= render("menu") %> <%= render("shared/footer") %>
```

The first line renders `_menu.html.tse` from the current template's directory;
the second reaches into `app/views/shared/`.

### Using Partials to Simplify Views

Pull repeated markup into partials so each template reads as an outline of the
page:

```html
<%= render("shared/ad-banner") %>

<h1>Products</h1>
<p>Here are a few of our fine products:</p>
<%= render({ partial: "product", collection: this.products }) %> <%= render("shared/footer") %>
```

### Passing Data to Partials with `locals` Option

`locals` hands named values to a partial, where they are read as plain
variables:

```html
<%= render({ partial: "form", locals: { article: this.article, submitLabel: "Save" } }) %>
```

Inside `_form.html.tse`, `article` and `submitLabel` are in scope.

### Using `localAssigns`

A partial cannot reference a local that was not passed. `localAssigns` holds
every local the caller supplied, so an optional one can be tested before use:

```html
<% if (localAssigns.related != null) { %> <%= render({ partial: "related", collection:
localAssigns.related }) %> <% } %>
```

### `render` without `partial` and `locals` Options

When the only options are a partial name and its locals, they can be passed
positionally:

```html
<%= render("form", { article: this.article }) %>
```

### The `as` and `object` Options

`object` passes a single value under the partial's own name, and `as` renames
it:

```html
<%= render({ partial: "article", object: this.featured, as: "item" }) %>
```

Passing a record straight to `render` does both for you: `render(this.article)`
renders `articles/_article.html.tse` with `article` set.

### Rendering Collections

`collection` renders the partial once per element, with each element in a local
named after the partial. Passing the array alone works too, when every element
is a model of the same class:

```html
<%= render({ partial: "product", collection: this.products }) %> <%= render(this.products) %>
```

An empty collection renders `null`, so a fallback reads naturally:
`<%= render(this.products) || "No products yet." %>`.

### Spacer Templates

`spacerTemplate` names a partial rendered between each pair of elements:

```html
<%= render({ partial: "product", collection: this.products, spacerTemplate: "product-ruler" }) %>
```

### Counter Variables

Each element's partial also receives `product_counter`, its zero-based index,
and `product_iteration`, an object answering `index`, `size`, `isFirst()` and
`isLast()`. These local names follow the partial (or `as`) name with Rails'
`_counter` / `_iteration` suffixes.

```html
<li class="<%= product_iteration.isFirst() ? 'first' : '' %>">
  <%= product_counter + 1 %>. <%= product.name %>
</li>
```

### `local_assigns` with Pattern Matching

Ruby pattern matching has no TypeScript form, so this section of the Rails
guide does not apply; see
[`CLAUDE.md`, "Ruby pattern matching has no port"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#ruby-pattern-matching-has-no-port-assert_pattern-deconstruct_keys).
Destructure `localAssigns` with ordinary JavaScript instead.

### Strict Locals

A magic comment at the top of a partial declares exactly which locals it
accepts, with optional defaults:

```html
<%# locals: (article:, submitLabel: "Save") -%>
<form>…<button><%= submitLabel %></button></form>
```

Rendering it without `article`, or with a local it does not list, raises an
`ArgumentError` naming the offending key. Because templates are compiled ahead
of time, the declared locals also type the template's module.

## Layouts

A layout is the page frame around a template: `app/views/layouts/application.html.tse`
holds the `<html>` shell and calls `yield` where the action's output goes.
Choosing layouts from a controller is covered in the
[Action Controller Overview](./action-controller-overview.md).

### Partial Layouts

A partial can have a layout of its own, which is itself a partial and yields to
the content:

```html
<%= render({ partial: "article", locals: { article: this.article }, layout: "box" }) %>
```

`_box.html.tse` wraps the article:

```html
<div class="box"><%= yield %></div>
```

### Collection with Partial Layouts

The `layout` option works with `collection` too, wrapping each element's
rendering in the layout partial:

```html
<%= render({ partial: "article", collection: this.articles, layout: "box" }) %>
```

## Helpers

Action View ships helpers for formatting numbers and dates, building links and
tags, sanitizing input and capturing content. They are covered in
[Action View Helpers](./action-view-helpers.md).

## Localized Views

A template can have per-locale variants: with `I18n.locale` set to `"de"`,
`show.de.html.tse` is chosen over `show.html.tse` when both exist.
