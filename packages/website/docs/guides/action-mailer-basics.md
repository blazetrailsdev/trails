---
title: Action Mailer Basics
description: Sending email from a Trails application — mailer classes, views and layouts, attachments, delivery now or later, callbacks, configuration, previews, interceptors and observers.
---

# Action Mailer Basics

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [actionmailer package](/packages/actionmailer) · [mail package](/packages/mail) ·
> [Action Mailbox Basics](./action-mailbox-basics.md)

Action Mailer is how a Trails application sends email. After reading this
guide you will know:

- How to write a mailer class and the templates that render its messages.
- How to add attachments, build multipart messages and use layouts.
- How to deliver a message immediately or through a background job.
- How to run code before and after a mailer action or a delivery.
- How to configure delivery, preview messages in the browser, and intercept or
  observe outgoing mail.

## What is Action Mailer?

A mailer is to email what a controller is to an HTTP response. Each public
method on a mailer class is an _action_: it gathers the data a message needs,
sets headers, and calls `mail()`, which renders a template from `app/views`
into the message body. The message itself is a `Mail::Message` from
`@blazetrails/mail`, the port of the `mail` gem, so headers, parts and
encodings behave as they do in Ruby.

## Creating a Mailer and Views

### Generate the Mailer

```sh
pnpm trails generate mailer user welcome-email
```

This writes `app/mailers/user-mailer.ts`, an `app/mailers/application-mailer.ts`
base class if one is missing, a template per action under
`app/views/user-mailer/`, and a test with a preview.

### Edit the Mailer

`ApplicationMailer` holds the settings every mailer shares. `default` sets
headers that apply to every message unless an action overrides them.

```ts
import { ActionMailer } from "@blazetrails/actionmailer";

export class ApplicationMailer extends ActionMailer.Base {
  static {
    this.default({ from: "notifications@example.com" });
    this.layout("mailer");
  }
}
```

An action reads what it needs and returns the result of `mail()`. Values set on
`this` are visible to the template, as instance variables are in Rails.

```ts
import { ActionMailer } from "@blazetrails/actionmailer";

export class UserMailer extends ActionMailer.Base {
  declare user: { name: string; email: string };
  declare url: string;

  welcomeEmail() {
    this.user = this.params.user as UserMailer["user"];
    this.url = "https://example.com/login";
    return this.mail({ to: this.user.email, subject: "Welcome to My Awesome Site" });
  }
}
```

### Create a Mailer View

Templates are `.tse` files, trails' spelling of ERB, named after the action:
`app/views/user-mailer/welcome-email.html.tse` and
`welcome-email.text.tse`. They are compiled ahead of time rather than
evaluated at run time; the [actionview package page](/packages/actionview)
explains the template pipeline.

```html
<h1>Welcome to example.com, <%= user.name %></h1>
<p>To log in to the site, follow this link: <%= url %>.</p>
```

### Call the Mailer

Rails calls a mailer action on the class (`UserMailer.welcome_email`), which
builds a `MessageDelivery` without rendering anything yet. Trails does the
same, through a class-level `method_missing` hook, so the action's name is not
visible to TypeScript on the class and a call site names its type. The
[actionmailer package page](/packages/actionmailer) covers this dispatch.

```ts
import type { MessageDelivery } from "@blazetrails/actionmailer";

declare const UserMailer: {
  with(params: Record<string, unknown>): { welcomeEmail(): MessageDelivery };
};

const delivery = UserMailer.with({ user }).welcomeEmail();

await delivery.deliverLater(); // enqueue on Active Job
await delivery.deliverNow(); // render and send in this process
```

`with` passes parameters that the action reads as `this.params`.
`deliverLater` enqueues a `MailDeliveryJob`, so the request that triggered
the email does not wait for SMTP. `deliverLater({ wait: hours(1) })` and
`waitUntil` schedule it.

## Multipart Emails and Attachments

### Adding Attachments

`attachments()` must be filled before `mail()` is called; the message is
built at that point.

```ts
import { ActionMailer } from "@blazetrails/actionmailer";

export class InvoiceMailer extends ActionMailer.Base {
  async invoice(pdf: Uint8Array) {
    await this.attachments().set("invoice.pdf", pdf);
    return this.mail({ to: "billing@example.com", subject: "Your invoice" });
  }
}
```

Binary content is a `Uint8Array`. A hash with `mimeType` and `content` sets
the type explicitly instead of guessing it from the file name.

### Making Inline Attachments

`attachments().inline().set(name, data)` attaches a file for use inside the
HTML body, where the template reaches it with
`imageTag(attachments().get("logo.png").url())`.

### Multipart Emails

When both an `.html.tse` and a `.text.tse` template exist for an action, the
message is sent as `multipart/alternative` with both parts. To control the
parts directly, pass a block to `mail()` and call the collector's format
methods.

### Configuring Custom View Paths

`templatePath` and `templateName` in the `mail()` headers choose a different
template; `prependViewPath` adds a lookup directory for one mailer.

## Action Mailer Views

### Generating URLs

A mailer has no request, so it does not know the host. Set
`config.actionMailer.defaultUrlOptions = { host: "example.com" }` and the URL
helpers and named routes work as they do in controllers. Use the `…Url`
helpers, not `…Path`: a relative link means nothing in an inbox.

### Adding Images

`imageTag` in a mailer view builds an absolute URL from `assetHost`, which
must be set for the same reason.

### Caching Mailer Views

Fragment caching works in mailer views as it does in controller views, when
`config.actionMailer.performCaching` is on.

### Action Mailer Layouts

`layout("mailer")` renders inside `app/views/layouts/mailer.html.tse` (and its
`.text` sibling). A layout named after the mailer is picked up without the
call.

## Sending Email

### Multiple Recipients

`to`, `cc` and `bcc` take a string or an array of addresses.

### Sending Email with Name

`emailAddressWithName("jo@example.com", "Jo")` formats `Jo <jo@example.com>`,
quoting the name when it needs it.

### Subject Translation

Without a `subject` header, the subject is looked up in I18n under
`<mailer-scope>.<action>.subject`, and falls back to the humanized action
name.

### Sending Emails without Template Rendering

`mail({ body: "…", contentType: "text/plain" })` sends a body directly.

### Dynamic Delivery Options

`deliveryMethodOptions` in the `mail()` headers overrides the SMTP settings for
one message, such as a per-tenant account.

## Action Mailer Callbacks

`beforeAction`, `afterAction` and `aroundAction` run around the action, as in
controllers, and can read `this.params`. `beforeDeliver`, `afterDeliver` and
`aroundDeliver` run around the delivery itself. A `beforeAction` that sets
`this.message.performDeliveries = false` cancels the send.

```ts
import { ActionMailer } from "@blazetrails/actionmailer";

type DeliverCallbacks = { afterDeliver(callback: () => void): void };

export class AuditedMailer extends ActionMailer.Base {
  static {
    (this as unknown as DeliverCallbacks).afterDeliver(() => {
      console.log("delivered");
    });
  }
}
```

## Action Mailer Configuration

Configuration lives on `config.actionMailer` in
`config/environments/*.ts`:

```ts
import "@blazetrails/trailties/trailties/action-mailer";
import { Trails } from "@blazetrails/trailties";

Trails.application!.configure(function () {
  this.config.actionMailer.deliveryMethod = "smtp";
  this.config.actionMailer.smtpSettings = {
    address: "smtp.example.com",
    port: 587,
    userName: "apikey",
    authentication: "plain",
  };
});
```

The delivery methods are `smtp` (through `@blazetrails/net-smtp`),
`sendmail`, `file` and `test`. A generated application uses `test` in the
test environment, which appends to `ActionMailer.Base.deliveries` instead of
sending.

## Previewing and Testing Mailers

### Previewing Emails

A preview class under `test/mailers/previews/` returns a message from each
method. The development server lists them at `/trails/mailers`, rendering the
HTML and text parts side by side.

### Testing

`ActionMailer.TestCase` builds a message from a mailer action and asserts on
its headers and body. `TestHelper` adds `assertEmails`,
`assertEnqueuedEmails` and `assertEnqueuedEmailWith` to any test, such as a
controller test that should send a welcome email.

## Intercepting and Observing Emails

### Rescuing Errors

`rescueFrom` in a mailer handles errors raised while an action runs or a
delivery job performs.

### Intercepting Emails

An interceptor's `deliveringEmail(message)` runs before a message is sent and
may rewrite it — sending every staging email to one inbox, for example.
Register it with `ActionMailer.Base.registerInterceptor(Interceptor)`.

### Observing Emails

An observer's `deliveredEmail(message)` runs after a successful send. Register
it with `ActionMailer.Base.registerObserver(Observer)`.
