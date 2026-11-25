import { days } from "@blazetrails/activesupport";
import { getFs, getPath } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

const cachingDev = await getFs().exists(getPath().join(Trails.root()!, "tmp/caching-dev.txt"));

Trails.application.configure(function () {
  // Settings specified here will take precedence over those in config/application.ts.

  // Make code changes take effect immediately without server restart.
  this.config.enableReloading = true;

  // Do not eager load code on boot.
  this.config.eagerLoad = false;

  // Show full error reports.
  this.config.considerAllRequestsLocal = true;

  // Enable server timing.
  this.config.serverTiming = true;

  // Enable/disable Action Controller caching. By default Action Controller caching is disabled.
  // Run trails dev:cache to toggle Action Controller caching.
  if (cachingDev) {
    this.config.publicFileServer.headers = { "cache-control": `public, max-age=${days(2).toI()}` };
  } else {
    this.config.actionController.performCaching = false;
  }

  // Change to :null_store to avoid any caching.
  this.config.cacheStore = ":memory_store";

  // Print deprecation notices to the Trails logger.
  this.config.activeSupport.deprecation = "log";

  // Raise an error on page load if there are pending migrations.
  this.config.activeRecord.migrationError = "page_load";

  // Highlight code that triggered database queries in logs.
  this.config.activeRecord.verboseQueryLogs = true;

  // Append comments with runtime information tags to SQL queries in logs.
  this.config.activeRecord.queryLogTagsEnabled = true;

  // Raises error for missing translations.
  // this.config.i18n.raiseOnMissingTranslations = true;

  // Annotate rendered view with file names.
  this.config.actionView.annotateRenderedViewWithFilenames = true;

  // Raise error when a before_action's only/except options reference missing actions.
  this.config.actionController.raiseOnMissingCallbackActions = true;
});
