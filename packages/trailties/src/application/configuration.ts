import { Session } from "@blazetrails/actionpack";
import { File, OpenSSL } from "@blazetrails/ruby-compat";
import { RuntimeError } from "@blazetrails/ruby-compat";
import { EngineConfiguration } from "../engine/configuration.js";
import { Trails } from "../rails.js";
import type { Root } from "../paths.js";

export interface PublicFileServer {
  enabled: boolean;
  indexName: string;
  headers: Record<string, string> | null;
}
export type SslOptions = {
  hsts?: { subdomains?: boolean } | boolean;
  secureCookies?: boolean;
  redirect?: unknown;
};
type WeekDay = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
type LogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "unknown";

export class Configuration extends EngineConfiguration {
  allowConcurrency: boolean | null = null;
  considerAllRequestsLocal = false;
  filterParameters: Array<string | RegExp> = [];
  precompileFilterParameters: boolean | null = null;
  helpersPaths: string[] = [];
  hosts: Array<string | RegExp> = [];
  hostAuthorization: Record<string, unknown> = {};
  publicFileServer: PublicFileServer = { enabled: true, indexName: "index", headers: null };
  assumeSsl = false;
  forceSsl = false;
  sslOptions: SslOptions = {};
  timeZone = "UTC";
  beginningOfWeek: WeekDay = "monday";
  logger: unknown = null;
  logLevel: LogLevel = "debug";
  logFormatter: unknown = null;
  logTags: unknown[] = [];
  logFileSize: number | null = null;
  autoflushLog = true;
  silenceHealthcheckPath: string | null = null;
  cacheClasses: boolean | null = null;
  cacheStore: unknown = ["file_store", "tmp/cache/"];
  reloadClassesOnlyOnChange = true;
  fileWatcher: unknown = null;
  exceptionsApp: unknown = null;
  debugExceptionResponseFormat: "default" | "api" | null = null;
  railtiesOrder: Array<string | { instance(): unknown }> = [":all"];
  relativeUrlRoot: string | null = null;
  requireMasterKey = false;
  secretKeyBase: string | null = null;
  credentials: { contentPath: string | null; keyPath: string | null } = {
    contentPath: null,
    keyPath: null,
  };
  disableSandbox = false;
  sandboxByDefault = false;
  encoding = "utf-8";
  apiOnly = false;
  eagerLoad: boolean | null = null;
  addAutoloadPathsToLoadPath = true;
  rakeEagerLoad = false;
  serverTiming = false;
  domTestingDefaultHtmlVersion = ":html4";
  yjit = false;

  /** @internal */
  private _loadedConfigVersion: string | number | null = null;

  get loadedConfigVersion(): string | number | null {
    return this._loadedConfigVersion;
  }

  loadDefaults(targetVersion: string | number): void {
    switch (String(targetVersion)) {
      case "5.0": {
        if (this.respondTo("actionController")) {
          const actionController = this.get("actionController") as Record<string, unknown>;
          actionController.perFormCsrfTokens = true;
          actionController.forgeryProtectionOriginCheck = true;
        }

        if (this.respondTo("activeSupport")) {
          const activeSupport = this.get("activeSupport") as Record<string, unknown>;
          activeSupport.toTimePreservesTimezone = ":offset";
        }

        if (this.respondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.belongsToRequiredByDefault = true;
        }

        this.sslOptions = { hsts: { subdomains: true } };
        break;
      }
      case "5.1": {
        this.loadDefaults("5.0");

        if (this.respondTo("assets")) {
          const assets = this.get("assets") as Record<string, unknown>;
          assets.unknownAssetFallback = false;
        }

        if (this.respondTo("actionView")) {
          const actionView = this.get("actionView") as Record<string, unknown>;
          actionView.formWithGeneratesRemoteForms = true;
        }
        break;
      }
      case "5.2": {
        this.loadDefaults("5.1");

        if (this.respondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.cacheVersioning = true;
        }

        if (this.respondTo("actionDispatch")) {
          const actionDispatch = this.get("actionDispatch") as Record<string, unknown>;
          actionDispatch.useAuthenticatedCookieEncryption = true;
        }

        if (this.respondTo("activeSupport")) {
          const activeSupport = this.get("activeSupport") as Record<string, unknown>;
          activeSupport.useAuthenticatedMessageEncryption = true;
          activeSupport.hashDigestClass = OpenSSL.Digest.SHA1;
        }

        if (this.respondTo("actionController")) {
          const actionController = this.get("actionController") as Record<string, unknown>;
          actionController.defaultProtectFromForgery = true;
        }

        if (this.respondTo("actionView")) {
          const actionView = this.get("actionView") as Record<string, unknown>;
          actionView.formWithGeneratesIds = true;
        }
        break;
      }
      case "6.0": {
        this.loadDefaults("5.2");

        if (this.respondTo("actionView")) {
          const actionView = this.get("actionView") as Record<string, unknown>;
          actionView.defaultEnforceUtf8 = false;
        }

        if (this.respondTo("actionDispatch")) {
          const actionDispatch = this.get("actionDispatch") as Record<string, unknown>;
          actionDispatch.useCookiesWithMetadata = true;
        }

        if (this.respondTo("actionMailer")) {
          const actionMailer = this.get("actionMailer") as Record<string, unknown>;
          actionMailer.deliveryJob = "ActionMailer::MailDeliveryJob";
        }

        if (this.respondTo("activeStorage")) {
          const activeStorage = this.get("activeStorage") as { queues: Record<string, unknown> };
          activeStorage.queues.analysis = ":active_storage_analysis";
          activeStorage.queues.purge = ":active_storage_purge";
        }

        if (this.respondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.collectionCacheVersioning = true;
        }
        break;
      }
      case "6.1": {
        this.loadDefaults("6.0");

        if (this.respondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.hasManyInversing = true;
        }

        if (this.respondTo("activeJob")) {
          const activeJob = this.get("activeJob") as Record<string, unknown>;
          activeJob.retryJitter = 0.15;
        }

        if (this.respondTo("actionDispatch")) {
          const actionDispatch = this.get("actionDispatch") as Record<string, unknown>;
          actionDispatch.cookiesSameSiteProtection = ":lax";
          actionDispatch.sslDefaultRedirectStatus = 308;
        }

        if (this.respondTo("actionView")) {
          const actionView = this.get("actionView") as Record<string, unknown>;
          actionView.formWithGeneratesRemoteForms = false;
          actionView.preloadLinksHeader = true;
        }

        if (this.respondTo("activeStorage")) {
          const activeStorage = this.get("activeStorage") as {
            trackVariants?: unknown;
            queues: Record<string, unknown>;
          };
          activeStorage.trackVariants = true;

          activeStorage.queues.analysis = null;
          activeStorage.queues.purge = null;
        }

        if (this.respondTo("actionMailbox")) {
          const actionMailbox = this.get("actionMailbox") as { queues: Record<string, unknown> };
          actionMailbox.queues.incineration = null;
          actionMailbox.queues.routing = null;
        }

        if (this.respondTo("actionMailer")) {
          const actionMailer = this.get("actionMailer") as Record<string, unknown>;
          actionMailer.deliverLaterQueueName = null;
        }
        break;
      }
      case "7.0": {
        this.loadDefaults("6.1");

        if (this.respondTo("actionDispatch")) {
          const actionDispatch = this.get("actionDispatch") as Record<string, unknown>;
          actionDispatch.defaultHeaders = {
            "X-Frame-Options": "SAMEORIGIN",
            "X-XSS-Protection": "0",
            "X-Content-Type-Options": "nosniff",
            "X-Download-Options": "noopen",
            "X-Permitted-Cross-Domain-Policies": "none",
            "Referrer-Policy": "strict-origin-when-cross-origin",
          };
          actionDispatch.cookiesSerializer = ":json";
        }

        if (this.respondTo("actionView")) {
          const actionView = this.get("actionView") as Record<string, unknown>;
          actionView.buttonToGeneratesButtonTag = true;
          actionView.applyStylesheetMediaDefault = false;
        }

        if (this.respondTo("activeSupport")) {
          const activeSupport = this.get("activeSupport") as Record<string, unknown>;
          activeSupport.hashDigestClass = OpenSSL.Digest.SHA256;
          activeSupport.keyGeneratorHashDigestClass = OpenSSL.Digest.SHA256;
          activeSupport.cacheFormatVersion = 7.0;
          activeSupport.executorAroundTestCase = true;
        }

        if (this.respondTo("actionMailer")) {
          const actionMailer = this.get("actionMailer") as Record<string, unknown>;
          actionMailer.smtpTimeout = 5;
        }

        if (this.respondTo("activeStorage")) {
          const activeStorage = this.get("activeStorage") as Record<string, unknown>;
          activeStorage.videoPreviewArguments =
            "-vf 'select=eq(n\\,0)+eq(key\\,1)+gt(scene\\,0.015),loop=loop=-1:size=2,trim=start_frame=1'" +
            " -frames:v 1 -f image2";

          activeStorage.variantProcessor = ":vips";
          activeStorage.multipleFileFieldIncludeHidden = true;
        }

        if (this.respondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.verifyForeignKeysForFixtures = true;
          activeRecord.partialInserts = false;
          activeRecord.automaticScopeInversing = true;
        }

        if (this.respondTo("actionController")) {
          const actionController = this.get("actionController") as Record<string, unknown>;
          actionController.raiseOnOpenRedirects = true;
          actionController.wrapParametersByDefault = true;
        }
        break;
      }
      case "7.1": {
        this.loadDefaults("7.0");

        this.addAutoloadPathsToLoadPath = false;
        this.precompileFilterParameters = true;
        this.domTestingDefaultHtmlVersion = ":html4";

        if (Trails.env.isLocal()) {
          this.logFileSize = 100 * 1024 * 1024;
        }

        if (this.respondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown> & {
            encryption: Record<string, unknown>;
          };
          activeRecord.runCommitCallbacksOnFirstSavedInstancesInTransaction = false;
          activeRecord.sqlite3AdapterStrictStringsByDefault = true;
          activeRecord.queryLogTagsFormat = ":sqlcommenter";
          activeRecord.raiseOnAssignToAttrReadonly = true;
          activeRecord.belongsToRequiredValidatesForeignKey = false;
          activeRecord.beforeCommittedOnAllRecords = true;
          activeRecord.defaultColumnSerializer = null;
          activeRecord.encryption.hashDigestClass = OpenSSL.Digest.SHA256;
          activeRecord.encryption.supportSha1ForNonDeterministicEncryption = false;
          activeRecord.marshallingFormatVersion = 7.1;
          activeRecord.runAfterTransactionCallbacksInOrderDefined = true;
          activeRecord.generateSecureTokenOn = ":initialize";
        }

        if (this.respondTo("actionDispatch")) {
          const actionDispatch = this.get("actionDispatch") as Record<string, unknown>;
          actionDispatch.defaultHeaders = {
            "X-Frame-Options": "SAMEORIGIN",
            "X-XSS-Protection": "0",
            "X-Content-Type-Options": "nosniff",
            "X-Permitted-Cross-Domain-Policies": "none",
            "Referrer-Policy": "strict-origin-when-cross-origin",
          };
          actionDispatch.debugExceptionLogLevel = ":error";
        }

        if (this.respondTo("activeSupport")) {
          const activeSupport = this.get("activeSupport") as Record<string, unknown>;
          activeSupport.cacheFormatVersion = 7.1;
          activeSupport.messageSerializer = ":json_allow_marshal";
          activeSupport.useMessageSerializerForMetadata = true;
          activeSupport.raiseOnInvalidCacheExpirationTime = true;
        }

        if (this.respondTo("actionView")) {
          /** @empty */
        }

        if (this.respondTo("actionText")) {
          /** @empty */
        }
        break;
      }
      case "7.2": {
        this.loadDefaults("7.1");

        this.yjit = true;

        if (this.respondTo("activeStorage")) {
          const activeStorage = this.get("activeStorage") as Record<string, unknown>;
          activeStorage.webImageContentTypes = [
            "image/png",
            "image/jpeg",
            "image/gif",
            "image/webp",
          ];
        }

        if (this.respondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.postgresqlAdapterDecodeDates = true;
          activeRecord.validateMigrationTimestamps = true;
        }
        break;
      }
      case "8.0": {
        this.loadDefaults("7.2");

        if (this.respondTo("activeSupport")) {
          const activeSupport = this.get("activeSupport") as Record<string, unknown>;
          activeSupport.toTimePreservesTimezone = ":zone";
        }

        if (this.respondTo("actionDispatch")) {
          const actionDispatch = this.get("actionDispatch") as Record<string, unknown>;
          actionDispatch.strictFreshness = true;
        }
        break;
      }
      default:
        throw new RuntimeError(`Unknown version "${String(targetVersion)}"`);
    }

    this._loadedConfigVersion = targetVersion;
  }

  autoloadLib({ ignore }: { ignore: string | string[] }): void {
    const lib = File.join(this.root as string, "lib");

    this.autoloadPaths.push(lib);
    this.eagerLoadPaths.push(lib);
  }

  /** @internal */
  private _sessionStore: unknown = null;
  /** @internal */
  private _sessionOptions: Record<string, unknown> = {};

  sessionStore(newSessionStore?: unknown, options?: Record<string, unknown>): unknown {
    if (newSessionStore != null && newSessionStore !== false) {
      this._sessionStore = newSessionStore;
      return (this._sessionOptions = options ?? {});
    }
    if (this._sessionStore === ":disabled") return null;
    if (typeof this._sessionStore === "string" && this._sessionStore.startsWith(":")) {
      return Session.resolveStore(this._sessionStore);
    }
    return this._sessionStore;
  }

  sessionStoreQ(): unknown {
    return this._sessionStore;
  }

  get sessionOptions(): Record<string, unknown> {
    return this._sessionOptions;
  }
  set sessionOptions(value: Record<string, unknown>) {
    this._sessionOptions = value;
  }

  get enableReloading(): boolean {
    return !this.cacheClasses;
  }
  set enableReloading(value: boolean) {
    this.cacheClasses = !value;
  }
  reloadingEnabled(): boolean {
    return this.enableReloading;
  }

  override paths(): Root {
    const paths = super.paths();
    if (!paths.get("public")) paths.add("public");
    if (!paths.get("lib/templates")) paths.add("lib/templates");
    return paths;
  }
}
