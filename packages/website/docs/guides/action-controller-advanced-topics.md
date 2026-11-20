---
title: Action Controller Advanced Topics
description: Forgery protection, browser gating, HTTP authentication, file downloads, log filtering, HTTPS enforcement, the health check endpoint, and error handling in Trails controllers.
---

# Action Controller Advanced Topics

> **See also:** [Guides index](./index.md) ·
> [Action Controller Overview](./action-controller-overview.md) ·
> [actionpack package](/packages/actionpack)

The [overview](./action-controller-overview.md) covers what every controller
does on every request. This guide covers the features an application reaches
for once it is in front of real users. After reading it you will know:

- How Trails defends forms against cross-site request forgery.
- How to turn away browsers too old to run the application.
- How to protect an action with HTTP Basic, Digest, or Token authentication.
- How to send a file or generated data as a download.
- How to keep secrets out of the request log.
- How to require HTTPS, and what the built-in health check does.
- How to turn exceptions into proper responses.

## Introduction

Everything here is a class-level declaration on a controller, or an instance
method an action calls. All of it lives in `@blazetrails/actionpack`, mixed
into `ActionController.Base` from the same modules Rails uses
(`RequestForgeryProtection`, `AllowBrowser`, `HttpAuthentication`,
`DataStreaming`, `Rescue`), so a feature declared on `ApplicationController`
applies to every controller below it.

## Authenticity Token and Request Forgery Protection

A cross-site request forgery tricks a signed-in user's browser into submitting
a request to your application from another site. The browser attaches the
user's cookies, so without a further check the request looks legitimate.

The defence is a token that only pages your application rendered can know.
Form helpers embed it as a hidden `authenticity_token` field, and the layout's
CSRF meta tags expose it to JavaScript for `fetch` requests. On every
non-`GET` request the controller compares the submitted token with the one in
the session; a mismatch triggers the configured strategy.

```ts
import { ActionController } from "@blazetrails/actionpack";

class ApplicationController extends ActionController.Base {
  static {
    this.protectFromForgery({ with: "exception" });
  }
}

class WebhooksController extends ApplicationController {
  static {
    this.skipForgeryProtection();
  }
}
```

The strategies are `"exception"` (raise `InvalidAuthenticityToken`, the usual
choice for HTML applications), `"reset_session"`, and `"null_session"`
(continue with an empty session, the default when none is named). The
strategy names are values Rails defines, so they keep its spelling.

Skip protection only for endpoints that authenticate another way — a webhook
verified by signature, an API authenticated by token — never for actions a
browser session reaches.

## Controlling Allowed Browsers

`allowBrowser` rejects requests from browsers older than a minimum version,
rendering `public/406-unsupported-browser.html` with a 406 status. The
`"modern"` shorthand admits browsers that support WebP images, web push,
badges, import maps, CSS nesting and the CSS `:has` selector:

```ts
import { ActionController } from "@blazetrails/actionpack";

class ApplicationController extends ActionController.Base {
  static {
    this.allowBrowser({ versions: "modern" });
  }
}
```

`versions` also takes an object of browser names and minimum versions, and the
call takes the same `only`/`except` options as a callback, so a single page can
demand more than the rest of the site. Requests without a recognisable user
agent (bots, `curl`) are let through.

## HTTP Authentication

Action Controller supports the three authentication schemes HTTP itself
defines. They are simplest for internal tools and APIs; applications with a
sign-in page usually authenticate against the session instead.

**Basic** sends a name and password with each request. The class-level
shorthand protects every action with a fixed pair:

```ts
import { ActionController } from "@blazetrails/actionpack";

class AdminController extends ActionController.Base {
  static {
    this.httpBasicAuthenticateWith({ name: "admin", password: "secret", except: "index" });
  }
}
```

For credentials checked against the database, call
`authenticateOrRequestWithHttpBasic` from a `beforeAction`. It hands the
submitted name and password to a function and, if that function answers a
falsy value, responds with `401` and a `WWW-Authenticate` challenge. Basic
credentials travel unencrypted, so only use them over HTTPS.

**Digest** avoids sending the password itself: the browser sends a hash
derived from it and a server-chosen nonce. The controller supplies a function
that looks up the password (or its stored digest) for a user name.

**Token** reads an `Authorization: Token token="..."` header, the common shape
for API clients. `authenticateOrRequestWithHttpToken` passes the token and any
extra options in the header to a function that decides whether to accept it.

## Streaming and File Downloads

`sendData` sends a string or a `Uint8Array` the action built in memory — a CSV
export, a generated PDF:

```ts
import { ActionController } from "@blazetrails/actionpack";

class ReportsController extends ActionController.Base {
  show() {
    const csv = "name,total\nAda,3\n";
    return this.sendData(csv, { filename: "report.csv", type: "text/csv" });
  }
}
```

`sendFile` streams a file already on disk without reading it into memory.
Both set `Content-Disposition`: `attachment` (the default) makes the browser
save the file, `inline` asks it to display the file. Pass a `type` when the
extension is not enough to infer it.

Never build a `sendFile` path from request parameters without checking it;
a crafted `../` in a parameter could otherwise reach any file the server can
read.

For responses written over time, `ActionController.Live` lets an action write
to the response stream piece by piece, which also underlies Server-Sent
Events. Each write reaches the client as soon as it is made.

## Log Filtering

The request log records each request's parameters, which is where a password
or a card number would leak. `config.filterParameters` in the application
configuration lists parameter names (strings or regular expressions) whose
values are replaced with `[FILTERED]` in the log. The generated application
already filters `passw`, `secret`, `token` and similar fragments; add the
application's own sensitive keys alongside them.

Redirect targets can leak too: `config.filterRedirect` replaces matching
`Location` URLs with `[FILTERED]` in the log line.

## Force HTTPS Protocol

`config.forceSsl = true` installs the `ActionDispatch::SSL` middleware. It
redirects plain-HTTP requests to HTTPS, marks cookies `secure`, and sends a
`Strict-Transport-Security` header so the browser never tries HTTP again.
Production configurations usually enable it; `config.sslOptions` tunes the
redirect and the HSTS header, and can exempt a path such as the health check
below.

## Built-in Health Check Endpoint

A generated application routes `GET /up` to the framework's health
controller. It answers `200` with a green page when the application boots and
handles a request, and `500` with a red page if that request raises. Load
balancers and uptime monitors poll it to decide whether an instance is alive.

The check deliberately does nothing else — no database query, no cache read —
so a struggling dependency does not make the load balancer pull every
instance at once. An application that wants a deeper check adds its own
controller and route for it.

## Handling Errors

An exception that escapes an action becomes a `500` in production and a
detailed error page in development. Some exceptions map to other statuses out
of the box: a missing record is a `404`, a missing required parameter a `400`,
a bad authenticity token a `422`.

`rescueFrom` handles an exception class inside the controller instead, by
method name or with a function bound to the controller:

```ts
import { ActionController } from "@blazetrails/actionpack";

class NotAuthorized extends Error {}

class ApplicationController extends ActionController.Base {
  static {
    this.rescueFrom(NotAuthorized, {
      with: function (this: ApplicationController) {
        return this.redirectTo("/", { alert: "You are not allowed to do that." });
      },
    });
  }
}
```

Handlers are searched from the most recently declared, and a subclass's
handlers before its parent's, so a specific handler in one controller can
override a general one in `ApplicationController`. Rescue only exceptions you
can answer meaningfully; rescuing `Error` itself hides bugs that should reach
the error page.

The production error pages are static files in `public/` (`404.html`,
`422.html`, `500.html`), served without running application code so they
still work when the application itself is broken.

## Where to go next

- [actionpack](/packages/actionpack) lists each deviation from Rails the
  package carries.
- [Action Controller Overview](./action-controller-overview.md) covers
  parameters, cookies, the session and callbacks.
