// The test environment is used exclusively to run your application's
// test suite. You never need to work with it otherwise. Remember that
// your test database is "scratch space" for the test suite and is wiped
// and recreated between test runs. Don't rely on the data there!

import { isPresent } from "@blazetrails/activesupport";
import { Trails } from "@blazetrails/trailties";

Trails.application!.configure(function () {
  // Settings specified here will take precedence over those in config/application.ts.

  // While tests run files are not watched, reloading is not necessary.
  this.config.enableReloading = false;

  // Eager loading loads your entire application. When running a single test locally,
  // this is usually not necessary, and can slow down your test suite. However, it's
  // recommended that you enable it in continuous integration systems to ensure eager
  // loading is working properly before deploying your code.
  this.config.eagerLoad = isPresent(process.env.CI);

  // Configure public file server for tests with cache-control for performance.
  this.config.publicFileServer.headers = { "cache-control": "public, max-age=3600" };

  // Show full error reports.
  this.config.considerAllRequestsLocal = true;
  this.config.cacheStore = ":null_store";

  // Render exception templates for rescuable exceptions and raise for other exceptions.
  this.config.actionDispatch.showExceptions = "rescuable";

  // Disable request forgery protection in test environment.
  this.config.actionController.allowForgeryProtection = false;

  // Print deprecation notices to the stderr.
  this.config.activeSupport.deprecation = "stderr";

  // Raises error for missing translations.
  // this.config.i18n.raiseOnMissingTranslations = true;

  // Annotate rendered view with file names.
  // this.config.actionView.annotateRenderedViewWithFilenames = true;

  // Raise error when a before_action's only/except options reference missing actions.
  this.config.actionController.raiseOnMissingCallbackActions = true;
});
