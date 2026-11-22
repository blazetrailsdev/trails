---
title: Securing Trails Applications
description: The common attacks on web applications and the defences trails provides against each — sessions, CSRF, redirects, uploads, SQL injection, XSS, header injection and security headers.
---

# Securing Trails Applications

> **See also:** [Guides index](./index.md) ·
> [Action Controller Advanced Topics](./action-controller-advanced-topics.md) ·
> [Active Record Encryption](./active-record-encryption.md) ·
> [actionpack package](/packages/actionpack) ·
> [activerecord package](/packages/activerecord) ·
> [activesupport package](/packages/activesupport)

trails ships with defences against the attacks most web applications face,
and most are on by default. This guide walks through the attacks one at a
time and names the trails feature that guards against each. It covers:

- Authentication and session management.
- Cross-site request forgery.
- Redirects, file uploads and downloads.
- User management, logging and authorization.
- Injection: SQL, cross-site scripting, CSS, command line and headers.
- Security headers, including Content Security Policy.

## Authentication

`trails generate authentication` writes a session-based sign-in: a `User`
model with a password, a `Session` model, a `SessionsController`, and a
password reset flow mailed to the user.

### Implementation Details

#### `hasSecurePassword`

`hasSecurePassword` stores a bcrypt digest of the password in
`password_digest`, never the password itself, and adds an `authenticate`
method. Its bcrypt is the [bcrypt package](/packages/bcrypt).

```ts
import { Base } from "@blazetrails/activerecord";

class User extends Base {
  static {
    this.hasSecurePassword();
  }
}
```

#### `authenticateBy`

`User.authenticateBy({ emailAddress, password })` finds the user and checks
the password in one call. It takes the same time whether or not the email
exists, so a timing measurement cannot reveal which addresses have accounts.

## Sessions

### What Are Sessions?

HTTP is stateless; a session carries state from one request to the next. By
default the session lives in a cookie, encrypted and signed with the app's
`secretKeyBase`, so the client can neither read nor alter it.

### Session Hijacking

Whoever holds a session cookie is that user. Serve the whole application
over HTTPS so the cookie cannot be read off the network:

<!-- typecheck:skip -->

```ts
// config/environments/production.ts
config.forceSsl = true;
```

`forceSsl` redirects HTTP to HTTPS, marks cookies `secure`, and sends a
`Strict-Transport-Security` header.

### Session Storage

The cookie store holds at most 4 kB and is only as safe as `secretKeyBase`.
Keep that secret in the encrypted credentials, never in the repository. A
server-side store keeps only an id in the cookie.

### Rotating Encrypted and Signed Cookies

When the cookie cipher or digest changes, `config.actionDispatch.cookiesRotations`
registers the old settings so existing cookies are read and rewritten in the
new form.

### Replay Attacks for Cookie Sessions

A cookie session can be replayed: a copy of an old cookie still decrypts.
Never keep a balance or a credit in the session; keep it in the database,
and keep only the user's id in the session.

### Session Fixation

An attacker who plants a known session id before sign-in can use it after.
Call `resetSession()` in the controller on sign-in, so the signed-in session
has a fresh id.

### Session Expiry

A session that never expires widens every other attack. Expire it on the
server: store the time it was created, and refuse sessions older than your
limit.

## Cross-Site Request Forgery (CSRF)

### CSRF Countermeasures

#### Use GET and POST Appropriately

`GET` should only read. Anything that changes state goes through `POST`,
`PATCH`, `PUT` or `DELETE`, which a link or image tag on another site cannot
send.

#### Required Security Token

`protectFromForgery` checks a per-session token on every non-`GET` request.
Form helpers embed it, and `csrfMetaTags` exposes it to JavaScript:

```ts
import { ActionController } from "@blazetrails/actionpack";

class ApplicationController extends ActionController.Base {
  static {
    this.protectFromForgery({ with: "exception" });
  }
}
```

The strategies are described in
[Action Controller Advanced Topics](./action-controller-advanced-topics.md).

#### Clearing Persistent Cookies

If a "remember me" cookie outlives the session, clear it too when a forged
request is detected, by overriding `handleUnverifiedRequest`.

## Redirection and Files

### Redirection

Never redirect to a URL taken from params. `redirectTo` raises
`UnsafeRedirectError` for another host unless `allowOtherHost: true` is
passed, so pass it only for a host you have checked against a list.

### File Uploads

Never build a file path from a user-supplied name. Strip directory parts and
unexpected characters, or let [Active Storage](./active-storage-overview.md)
choose the storage key, as it does.

### Executable Code in File Uploads

Never store uploads under `public/`, where the web server may execute or
serve them as your own pages.

### File Downloads

`sendFile` with a path from params lets a user download any file the server
can read. Look the file up by id in the database instead, or check the
resolved path stays inside the directory you intend.

## User Management

### Brute-Forcing Accounts

Give the same error for an unknown email and a wrong password, and limit
attempts. `rateLimit` in a controller caps requests per client:

```ts
import { ActionController } from "@blazetrails/actionpack";
import { Duration } from "@blazetrails/activesupport";

class SessionsController extends ActionController.Base {
  static {
    this.rateLimit({ to: 10, within: Duration.minutes(3), only: "create" });
  }
}
```

### Account Hijacking

Require the current password to change the password or email, and send a
notice to the old address when the email changes.

### CAPTCHAs

trails ships no CAPTCHA; add one from a provider you trust where a form
attracts bots.

### Logging

`config.filterParameters` names params that are replaced with `[FILTERED]`
in the log, and in `inspect` output of records. A new app filters
`passw`, `email`, `secret`, `token`, `_key`, `crypt`, `salt`, `certificate`,
`otp` and `ssn`.

### Regular Expressions

In a Ruby regular expression `^` and `$` match at each line; trails runs on
JavaScript, where they match the whole string unless the `m` flag is set.
Validate with anchors and without `m`, so a value cannot smuggle a second
line past `validates … format`.

### Privilege Escalation

Never trust an id from params to name a record the user may touch. Scope the
lookup to the current user: `Current.user.articles.find(params.id)`.

## Injection

### Permitted Lists Versus Restricted Lists

Allow what is known good rather than refusing what is known bad. Strong
parameters are this rule for mass assignment: `params.expect({ article: ["title", "body"] })`
lets through only the named keys.

### SQL Injection

Never interpolate a param into SQL. Pass values as bind parameters, and
Active Record quotes them:

<!-- typecheck:skip -->

```ts
// Unsafe: the param becomes SQL.
await Project.where(`name = '${params.name}'`);

// Safe: the param is a bound value.
await Project.where("name = ?", params.name);
await Project.where({ name: params.name });
```

`sanitizeSqlArray`, `sanitizeSqlLike` and `quote` cover SQL you build by
hand.

### Cross-Site Scripting (XSS)

Templates escape every interpolated value by default. A string is output
raw only once marked `htmlSafe`, so mark only strings you built yourself.
Where users may write some HTML, `sanitize` keeps a permitted list of tags
and attributes, through the [html-sanitizer package](/packages/html-sanitizer).

### CSS Injection

Do not let users supply style sheets or `style` attributes; `sanitize`
removes `style` unless you permit it.

### Textile and Markdown Injection

A markup language that allows raw HTML passes it straight through. Sanitize
the HTML it produces, not its input.

### Ajax Injection

A response rendered as a string for JavaScript is not escaped by a template.
Escape it yourself, or render JSON.

### Command Line Injection

Never build a shell command from user input. Pass the program and its
arguments separately so no shell parses them.

### Header Injection

A header value from user input can carry a newline and start a header of its
own. Never copy a
param into `Location`, `Content-Disposition` or a cookie unchecked.

#### DNS Rebinding and Host Header Attacks

`HostAuthorization` refuses requests for hosts not in `config.hosts`. In
development it allows `localhost`; in production, list your domains.

## HTTP Security Headers

### Default Security Headers

`config.actionDispatch.defaultHeaders` sets headers on every response. A new
app sends `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 0`,
`X-Content-Type-Options: nosniff`, `X-Permitted-Cross-Domain-Policies: none`
and `Referrer-Policy: strict-origin-when-cross-origin`. Change or remove
any of them there.

### `Strict-Transport-Security` Header

Sent by `forceSsl`, it tells browsers to use HTTPS for your domain from then
on. `config.sslOptions` sets its `maxAge`, `subdomains` and `preload`.

### `Content-Security-Policy` Header

A Content Security Policy lists the sources a page may load scripts, styles
and other resources from, which blunts XSS that slips through. Configure it
in `config/initializers/content-security-policy.ts`:

<!-- typecheck:skip -->

```ts
Trails.application.configure(function () {
  this.config.contentSecurityPolicy((policy) => {
    policy.defaultSrc(":self", ":https");
    policy.scriptSrc(":self", ":https");
    policy.objectSrc(":none");
  });
});
```

A source keeps its leading colon, as ruled in
[`CLAUDE.md` § "A Ruby Symbol is a JS string"](https://github.com/blazetrailsdev/trails/blob/main/CLAUDE.md#ruby-idioms-that-do-not-translate-literally).
`reportUri` sends violations to an endpoint, and
`contentSecurityPolicyReportOnly` reports without blocking. A per-request
nonce, from `contentSecurityPolicyNonceGenerator`, lets an inline script run
when it carries `nonce: true`.

### `Permissions-Policy` Header

`config.permissionsPolicy` limits which browser features (camera,
geolocation, …) a page may use.

### Cross-Origin Resource Sharing

The [rack-cors package](/packages/rack-cors) answers CORS preflights and
adds the `Access-Control-*` headers for the origins you allow.

## Environmental Security

### Custom Credentials

Secrets belong in `config/credentials.yml.enc`, edited with
`trails credentials:edit` and decrypted with `config/master.key`, which is
never committed. `Trails.application.credentials` reads them at run time.
Database columns that hold sensitive data can be encrypted with
[Active Record Encryption](./active-record-encryption.md).
