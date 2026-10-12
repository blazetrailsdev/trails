import { TaggedLogging } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";

Trails.application!.configure(function () {
  // Settings specified here will take precedence over those in config/application.ts.

  // Code is not reloaded between requests.
  this.config.enableReloading = false;

  // Eager load code on boot for better performance and memory savings (ignored by Rake tasks).
  this.config.eagerLoad = true;

  // Full error reports are disabled.
  this.config.considerAllRequestsLocal = false;

  // Turn on fragment caching in view templates.
  this.config.actionController.performCaching = true;

  // Cache assets for far-future expiry since they are all digest stamped.
  this.config.publicFileServer.headers = { "cache-control": "public, max-age=31556952" };

  // Enable serving of images, stylesheets, and JavaScripts from an asset server.
  // this.config.assetHost = "http://assets.example.com";

  // Assume all access to the app is happening through a SSL-terminating reverse proxy.
  this.config.assumeSsl = true;

  // Force all access to the app over SSL, use Strict-Transport-Security, and use secure cookies.
  this.config.forceSsl = true;

  // Skip http-to-https redirect for the default health check endpoint.
  // this.config.sslOptions = { redirect: { exclude: (request) => request.path === "/up" } };

  // Log to STDOUT with the current request id as a default log tag.
  this.config.logTags = [":request_id"];
  this.config.logger = TaggedLogging.logger(process.stdout);

  // Change to "debug" to log everything (including potentially personally-identifiable information!)
  this.config.logLevel = process.env.RAILS_LOG_LEVEL ?? "info";

  // Prevent health checks from clogging up the logs.
  this.config.silenceHealthcheckPath = "/up";

  // Don't log any deprecations.
  this.config.activeSupport.reportDeprecations = false;

  // Enable locale fallbacks for I18n (makes lookups for any locale fall back to
  // the I18n.defaultLocale when a translation cannot be found).
  this.config.i18n.fallbacks = true;

  // Do not dump schema after migrations.
  this.config.activeRecord.dumpSchemaAfterMigration = false;

  // Only use "id" for inspections in production.
  this.config.activeRecord.attributesForInspect = ["id"];

  // Enable DNS rebinding protection and other `Host` header attacks.
  // this.config.hosts = [
  //   "example.com",     // Allow requests from example.com
  //   /.*\.example\.com/, // Allow requests from subdomains like `www.example.com`
  // ];
  //
  // Skip DNS rebinding protection for the default health check endpoint.
  // this.config.hostAuthorization = { exclude: (request) => request.path === "/up" };
});
