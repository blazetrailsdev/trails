---
title: Action View Form Helpers
description: Building HTML forms in Trails views — formWith, field helpers, model-bound forms, select boxes, date and time fields, file uploads, custom form builders, params naming and nested forms.
---

# Action View Form Helpers

> **See also:** [Guides index](./index.md) ·
> [Action View Overview](./action-view-overview.md) ·
> [Action View Helpers](./action-view-helpers.md) ·
> [actionview package](/packages/actionview)

Forms are how users send data to an application. Writing their HTML by hand
means keeping field names, ids, CSRF tokens and HTTP methods in step with the
server; Action View's form helpers generate all of that. This guide covers:

- Search forms and the basic field helpers.
- Forms bound to a model object, and record identification.
- Select boxes, date and time fields, and collection helpers.
- File uploads and custom form builders.
- How field names map to `params`, and nested forms.

The helpers are the Rails helpers with camelCase names: `form_with` is
`formWith`, `text_field` is `textField`, and option keys follow suit
(`include_blank:` is `includeBlank`). Templates are `.html.tse` files, as the
[Action View Overview](./action-view-overview.md) describes. `formWith`
answers a promise, so a template awaits it, and its block may be `async`.

## Working with Basic Forms

`formWith` is the main helper. Called with a block, it renders a `<form>` and
hands the block a _form builder_ whose methods render the fields:

```html
<%= await formWith({}, async (form) => { %> Form contents <% }) %>
```

With no `url`, the form posts back to the current page. Every non-GET form
also carries a hidden `authenticity_token` field, which the CSRF protection in
[Action Controller](./action-controller-overview.md) checks.

### A Generic Search Form

A search form needs a URL, a GET method and a text field:

```html
<%= await formWith({ url: "/search", method: "get" }, async (form) => { %> <%= form.label("query",
"Search for:") %> <%= form.searchField("query") %> <%= form.submit("Search") %> <% }) %>
```

Use GET for a search so the results page has a URL that can be bookmarked and
shared. Use the route helper, such as `searchPath()`, in place of the literal
URL in a real app.

### Helpers for Generating Form Elements

The builder has one method per input type. Each takes the field's name first,
then an options object whose keys become HTML attributes.

#### Checkboxes

```html
<%= form.checkbox("petDog") %> <%= form.label("petDog", "I own a dog") %>
```

`checkbox` also renders a hidden field with the unchecked value (`"0"`), so
an unchecked box still sends something. Pass the checked and unchecked values
as the third and fourth arguments to change them.

#### Radio Buttons

```html
<%= form.radioButton("age", "child") %> <%= form.label("ageChild", "Under 21") %> <%=
form.radioButton("age", "adult") %> <%= form.label("ageAdult", "21 or over") %>
```

Radio buttons sharing a name form one group: the browser sends the value of
the one that is selected.

### Other Helpers of Interest

`textarea`, `hiddenField`, `passwordField`, `numberField`, `rangeField`,
`dateField`, `timeField`, `datetimeField`, `monthField`, `weekField`,
`searchField`, `emailField`, `telephoneField`, `urlField` and `colorField`
render the matching `<input>` or `<textarea>` element. The browser validates
the typed fields; the server must still validate everything it receives.

## Creating Forms with Model Objects

### Binding a Form to an Object

Pass a record as `model` and the form is bound to it. The fields read their
initial values from the record, and their names are scoped by the model's
param key:

```html
<%= await formWith({ model: this.book }, async (form) => { %> <%= form.textField("title") %> <%=
form.textField("author") %> <%= form.submit() %> <% }) %>
```

For a new `Book`, the form posts to `/books`, the fields are named
`book[title]` and `book[author]`, and the button reads "Create Book". For a
saved record it targets `/books/:id` with PATCH and reads "Update Book". In
the controller the values arrive as `params.require("book")`.

#### Composite Primary Key Forms

A model with a composite primary key works the same way: the record's URL is
built from every key column. See
[Composite Primary Keys](./active-record-composite-primary-keys.md).

#### The `fieldsFor` Helper

`fieldsFor` renders fields for a second object inside the same form, without
another `<form>` tag:

```html
<%= await formWith({ model: this.person }, async (personForm) => { %> <%=
personForm.textField("name") %> <%= await personForm.fieldsFor("contactDetail", async (contactForm)
=> { %> <%= contactForm.textField("phoneNumber") %> <% }) %> <% }) %>
```

The inner field is named `person[contactDetail][phoneNumber]`: each segment
is the name you passed.

### Relying on Record Identification

When the app uses resourceful routes, passing the record is all `formWith`
needs: it reads the model's name and whether the record is persisted to pick
the URL, method and button text. That is _record identification_, the same
lookup `polymorphicPath` performs.

### Working with Namespaces

For a namespaced route such as `/admin/books`, pass an array:

```html
<%= await formWith({ model: ["admin", this.book] }, async (form) => { %> … <% }) %>
```

### Forms with PATCH, PUT, or DELETE Methods

HTML forms can only GET or POST. For any other method `formWith` renders a
POST form with a hidden `_method` field, and the `MethodOverride` middleware
turns the request into the method you asked for:

```html
<%= await formWith({ url: searchPath(), method: "patch" }, async (form) => { %> … <% }) %>
```

## Making Select Boxes with Ease

`select` takes the field name and a list of choices. Each choice is a
`[label, value]` pair, or a plain value used for both:

```html
<%= form.select("city", [["Berlin", "BE"], ["Chicago", "CHI"], ["Madrid", "MD"]]) %>
```

The choice matching the field's current value is selected. Pass
`{ selected: "CHI" }` to choose another, `{ includeBlank: true }` for an empty
first option, or `{ prompt: "Pick a city" }` for a prompt.

### Option Groups for Select Boxes

Pass an object whose keys are group labels to render `<optgroup>` elements:

```html
<%= form.select("city", { Europe: [["Berlin", "BE"], ["Madrid", "MD"]], "North America":
[["Chicago", "CHI"]] }) %>
```

### Binding Select Boxes to Model Objects

Bound to a model, the select is named `book[city]` and preselects the
record's value. Choice values are compared as strings, so a numeric attribute
still matches its option.

## Using Date and Time Form Helpers

`dateField` and `timeField` render the browser's native pickers. For separate
selects per component, use `dateSelect`, `timeSelect` and `datetimeSelect`:

```html
<%= form.dateSelect("publishedOn") %>
```

This renders year, month and day selects named `book[publishedOn(1i)]`,
`book[publishedOn(2i)]` and `book[publishedOn(3i)]`. Active Record's
multiparameter assignment puts them back together into one date on
assignment.

### Select Boxes for Time or Date Components

`selectYear`, `selectMonth`, `selectDay`, `selectHour`, `selectMinute` and
`selectSecond` render a single component each, for forms not bound to a
date attribute.

### Selecting Time Zone

`timeZoneSelect` renders every zone ActiveSupport knows, labelled with its UTC
offset:

```html
<%= form.timeZoneSelect("timeZone") %>
```

## Collection Related Helpers

When the choices are records, the collection helpers read the value and the
label off each one. Load the records in the controller, then pass the array:

### The `collectionSelect` Helper

```html
<%= form.collectionSelect("cityId", this.cities, "id", "name") %>
```

### The `collectionRadioButtons` Helper

```html
<%= form.collectionRadioButtons("cityId", this.cities, "id", "name") %>
```

### The `collectionCheckboxes` Helper

```html
<%= form.collectionCheckboxes("interestIds", this.interests, "id", "name") %>
```

The checkbox fields are named `person[interestIds][]`, so `params` carries an
array of the chosen ids.

## Uploading Files

`fileField` renders a file input. A form containing one is given
`enctype="multipart/form-data"` automatically:

```html
<%= await formWith({ model: this.person }, async (form) => { %> <%= form.fileField("picture") %> <%
}) %>
```

The upload arrives in `params` as an uploaded-file object. To store it
attached to a record, use [Active Storage](./active-storage-overview.md);
`fileField` accepts `directUpload: true` for its direct uploads.

### CSV File Upload Example

A form with a `fileField("csvFile")` and no model hands the controller the
file under `params.get("csvFile")`; read its contents with the uploaded
file's `read()` and parse them as usual.

## Customizing Form Builders

The object `formWith` yields is a `FormBuilder` from `@blazetrails/actionview`.
Subclass it to add or change helpers, and pass the subclass as `builder`:

<!-- typecheck:skip -->

```ts
import { FormBuilder } from "@blazetrails/actionview";

export class LabellingFormBuilder extends FormBuilder {
  textField(attribute: string, options: Record<string, unknown> = {}) {
    return this.label(attribute).concat(super.textField(attribute, options));
  }
}
```

```html
<%= await formWith({ model: this.person, builder: LabellingFormBuilder }, async (form) => { %> <%=
form.textField("firstName") %> <% }) %>
```

The builder is skipped by the typecheck because `FormBuilder` generates its
field helpers at class definition, so TypeScript sees them as properties
rather than methods.

## Form Input Naming Conventions and `params` Hash

Field names are how the browser's flat list of fields becomes the nested
`params` object, and the bracket conventions are Rails'. Each segment is the attribute or
association name as written in the template.

### Basic Structure

`person[name]` arrives as `{ person: { name: "…" } }`, and the nesting can go
deeper: `person[address][city]`.

### Combining Arrays and Hashes

A name ending in `[]` collects every value into an array:
`person[phoneNumbers][]`. Inside an array, a new hash starts whenever a key
repeats, so `person[addresses][][line1]` and `person[addresses][][city]`
pairs build an array of addresses.

### Hashes with an Index

`fieldsFor` with an `index` option, or nested attributes (below), name fields
with an explicit index — `person[address][23][city]` — giving a hash keyed by
id rather than an array.

## Building Complex Forms

### Configuring the Model for Nested Attributes

`acceptsNestedAttributesFor` lets a parent record create, update and destroy
its children from one params hash:

```ts
import { Base } from "@blazetrails/activerecord";

class Person extends Base {
  static {
    this.hasMany("addresses", { inverseOf: "person" });
    this.acceptsNestedAttributesFor("addresses");
  }
}
```

### Nested Forms in the View

`fieldsFor` on the association renders one block per child:

```html
<%= await form.fieldsFor("addresses", async (addressesForm) => { %> <%=
addressesForm.textField("city") %> <% }) %>
```

The fields are named `person[addresses_attributes][0][city]`, and a persisted
child also gets a hidden `id` field. The `_attributes` suffix is the one
snake_case segment, because it names the generated nested-attributes writer.

### Permitting Parameters in the Controller

Permit the nested keys with
[strong parameters](./action-controller-overview.md):

<!-- typecheck:skip -->

```ts
params.require("person").permit("name", { addresses_attributes: ["id", "city", "_destroy"] });
```

### Removing Associated Objects

Pass `{ allowDestroy: true }` to `acceptsNestedAttributesFor`, and render a
`checkbox("_destroy")` in each child's fields; a checked box destroys that
child on save.

### Preventing Empty Records

`rejectIf` skips a child whose attributes are blank, so an untouched empty
row in the form does not create a record. `rejectIf: "all_blank"` rejects one
whose every value is blank.

## Forms to External Resources

A form posting to another site should not carry this app's CSRF token. Pass
`authenticityToken: false`, or a string to send a token the other site
issued:

```html
<%= await formWith({ url: "https://example.com/pay", authenticityToken: false }, async (form) => {
%> … <% }) %>
```

## Using Tag Helpers without a Form Builder

Every builder method has a standalone form ending in `Tag` — `textFieldTag`,
`selectTag`, `checkboxTag` — and the unbound helpers `textField("person",
"name")` take the object name first. Use them for a single field outside a
form, or to build a field the builder has no helper for.

## Using `form_tag` and `form_for`

`form_tag` and `form_for` predate `form_with` and are kept in Rails for older
code. trails ports both, as `formTag` and `formFor`; new code should use
`formWith`, which covers both cases.
