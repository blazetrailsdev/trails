---
title: Action Mailbox Basics
description: Receiving email in a Trails application — ingresses, routing inbound mail to mailboxes, processing and bouncing, callbacks, local testing and incineration.
---

# Action Mailbox Basics

> **See also:** [Guides index](./index.md) · [Trails Idioms](./idioms.md) ·
> [actionmailbox package](/packages/actionmailbox) ·
> [Action Mailer Basics](./action-mailer-basics.md)

Action Mailbox lets a Trails application receive email the way it receives web
requests. After reading this guide you will know:

- How inbound email reaches the application through an ingress.
- How to route each message to a mailbox class and process it there.
- How an inbound email's status changes, and how to bounce a message.
- How to try mailboxes out locally and in tests.
- How processed emails are cleaned up.

## What is Action Mailbox?

A mail provider or your own MTA hands each incoming message to an _ingress_
endpoint in the application. The ingress stores the raw message as an
`ActionMailbox.InboundEmail` record, with the source in Active Storage, and
enqueues a routing job. The job matches the message against your routes and
hands it to the matching _mailbox_, a class whose `process` method decides
what the email means: a reply to a comment, a forwarded receipt, a support
ticket.

Routing and processing happen in jobs, so a slow mailbox never makes the
provider's webhook time out.

## Setup

```sh
pnpm trails action_mailbox:install
pnpm trails db:migrate
```

The installer writes `app/mailboxes/application-mailbox.ts` and the migration
for the `action_mailbox_inbound_emails` table. Active Storage must be set up
too, since every inbound email keeps its source as a blob.

## Ingress Configuration

Pick the ingress that matches how mail arrives, in
`config/environments/production.ts`:

```ts
import "@blazetrails/actionmailbox/engine";
import { Trails } from "@blazetrails/trailties";

Trails.application!.configure(function () {
  this.config.actionMailbox.ingress = "relay";
});
```

Every ingress authenticates its caller. The relay ingress, used by Exim,
Postfix and Qmail, checks `action_mailbox.ingress_password` from the application's
credentials (or `RAILS_INBOUND_EMAIL_PASSWORD` in the environment). The
provider ingresses check their own signing secrets.

### Exim, Postfix and Qmail

These MTAs pipe each message to a command that posts it to the relay ingress:

```sh
pnpm trails action_mailbox:ingress:postfix URL=https://example.com/trails/action_mailbox/relay/inbound_emails INGRESS_PASSWORD=...
```

`action_mailbox:ingress:exim` and `action_mailbox:ingress:qmail` are the
same command for the other two, differing only in the exit codes each MTA
understands.

### Mailgun, Mandrill, Postmark and SendGrid

Each provider is configured to forward inbound mail to its own endpoint,
under `/trails/action_mailbox/<provider>/inbound_emails` (Mailgun's ends in `/mime`). Mailgun and
Mandrill verify a signing key read from credentials (or
`MAILGUN_INGRESS_SIGNING_KEY` / `MANDRILL_INGRESS_API_KEY`); Postmark and
SendGrid use the same basic-auth password as the relay ingress.
Postmark must be told to include the raw message.

## Processing Incoming Email

### Configure Routing

Routes live on `ApplicationMailbox`. A route's address is a string matched
against the recipients, a regular expression, a function of the inbound email,
or `"all"`. The first route that matches wins.

```ts
import { Base } from "@blazetrails/actionmailbox";

export class ApplicationMailbox extends Base {
  static {
    this.routing([
      [/^save@/i, "forwards"],
      ["support@example.com", "support"],
      ["all", "inbox"],
    ]);
  }
}
```

A mailbox name is the class name without its `Mailbox` suffix: `"forwards"`
routes to `ForwardsMailbox`.

### Create a Mailbox

```sh
pnpm trails generate mailbox forwards
```

### Process Email

`process` is where the work happens. `this.mail()` resolves the parsed
`Mail::Message`, and `this.inboundEmail` is the stored record.

```ts
import { Base } from "@blazetrails/actionmailbox";

export class ForwardsMailbox extends Base {
  async process(): Promise<void> {
    const mail = await this.mail();
    console.log(mail.subject(), mail.from());
  }
}
```

`beforeProcessing`, `afterProcessing` and `aroundProcessing` register
callbacks. A `beforeProcessing` callback that bounces the email stops the
rest of the chain, so `process` never runs:

```ts
import { Base } from "@blazetrails/actionmailbox";

declare const bounceMailer: {
  missingAccount(to: unknown): { deliverLater(): unknown; deliverNow(): unknown };
};
declare function accountExists(from: unknown): boolean;

export class SupportMailbox extends Base {
  static {
    this.beforeProcessing(async function (this: SupportMailbox) {
      const from = (await this.mail()).from();
      if (!accountExists(from)) {
        await this.bounceWith(bounceMailer.missingAccount(from));
      }
    });
  }
}
```

`bounceWith` marks the email bounced and delivers the reply through Active
Job; `bounceNowWith` sends it in-process.

### Inbound Email Status

An inbound email starts as `pending`, becomes `processing` while its mailbox
runs, and ends as `delivered`, `bounced` or `failed` (an error escaped
`process`). The predicates `isDelivered()`, `isBounced()` and `isFailed()`
read it. A `failed` email can be rerouted once the bug is fixed.

## Example

A mailbox that turns a reply into a comment finds the thread from the
recipient address and records the body:

```ts
import { Base } from "@blazetrails/actionmailbox";

declare const Comment: {
  create(attrs: Record<string, unknown>): Promise<unknown>;
};

export class RepliesMailbox extends Base {
  async process(): Promise<void> {
    const mail = await this.mail();
    const [to] = mail.to() as string[];
    const postId = /^reply-(\d+)@/.exec(to ?? "")?.[1];
    if (postId == null) return;
    await Comment.create({ postId, body: mail.body().decoded() });
  }
}
```

## Local Development and Testing

In development, the conductor at `/trails/conductor/action_mailbox/inbound_emails`
lists received emails and has a form to compose a new one, or upload a raw
`.eml`, and route it.

In tests, `ActionMailbox.TestHelper` builds inbound emails and runs them
through routing: `receiveInboundEmailFromMail({ to, from, subject, body })`,
`receiveInboundEmailFromFixture("welcome.eml")` and
`receiveInboundEmailFromSource(raw)`. The `create…` variants store the email
without routing it, for testing a mailbox class directly with
`await ForwardsMailbox.receive(inboundEmail)`.

## Incineration of InboundEmails

An inbound email is kept for 30 days after it is processed, then an
`IncinerationJob` destroys the record and its source. Change the window with
`config.actionMailbox.incinerateAfter = days(14)`, or turn incineration off
with `config.actionMailbox.incinerate = false`.
