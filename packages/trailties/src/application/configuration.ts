import {
  ContentSecurityPolicy,
  PermissionsPolicy,
  Session,
  type NonceGenerator,
} from "@blazetrails/actionpack";
import {
  FileUpdateChecker,
  getEnv,
  isPresent,
  OrderedOptions,
  setUtcToLocalReturnsUtcOffsetTimes,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  File,
  getFs,
  getPath,
  OpenSSL,
  SecureRandom,
} from "@blazetrails/ruby-compat";
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
type WeekDay =
  | ":sunday"
  | ":monday"
  | ":tuesday"
  | ":wednesday"
  | ":thursday"
  | ":friday"
  | ":saturday";
type LogLevel = "debug" | "info" | "warn" | "error" | "fatal" | "unknown";

/** @noRailsEquivalent PERMANENT */
export const LOAD_DEFAULTS_VERSION = "8.0";

export class Configuration extends EngineConfiguration {
  allowConcurrency: boolean | null = null;
  assetHost: string | null = null;
  considerAllRequestsLocal = false;
  filterParameters: Array<string | RegExp | ((key: string, value: unknown) => unknown)> = [];
  filterRedirect: Array<string | RegExp> = [];
  precompileFilterParameters: boolean | null = null;
  helpersPaths: string[] = [];
  hosts: Array<string | RegExp> = [];
  hostAuthorization: Record<string, unknown> = {};
  publicFileServer: PublicFileServer = { enabled: true, indexName: "index", headers: null };
  assumeSsl = false;
  forceSsl = false;
  sslOptions: SslOptions = {};
  timeZone = "UTC";
  beginningOfWeek: WeekDay = ":monday";
  logger: unknown = null;
  logLevel: LogLevel | number | string = "debug";
  logFormatter: unknown = null;
  logTags: unknown[] = [];
  logFileSize: number | null = null;
  autoflushLog = true;
  silenceHealthcheckPath: string | null = null;
  cacheClasses: boolean | null = null;
  cacheStore: unknown = [":file_store", `${this.root ?? ""}/tmp/cache/`];
  reloadClassesOnlyOnChange = true;
  fileWatcher: unknown = FileUpdateChecker;
  exceptionsApp: unknown = null;
  private _debugExceptionResponseFormat: "default" | "api" | null = null;
  x: Custom = new Custom();
  railtiesOrder: Array<string | { instance(): unknown }> = [":all"];
  relativeUrlRoot: string | null = null;
  requireMasterKey = false;
  private _secretKeyBase: string | null = null;
  private _localSecret?: string;
  credentials: { contentPath: string | null; keyPath: string | null } = {
    contentPath: null,
    keyPath: null,
  };
  disableSandbox = false;
  sandboxByDefault = false;
  encoding = "utf-8";
  private _apiOnly = false;
  eagerLoad: boolean | null = null;
  addAutoloadPathsToLoadPath = true;
  rakeEagerLoad = false;
  serverTiming = false;
  domTestingDefaultHtmlVersion = ":html4";
  private _contentSecurityPolicy: ContentSecurityPolicy | null = null;
  contentSecurityPolicyReportOnly = false;
  contentSecurityPolicyNonceGenerator: NonceGenerator | null = null;
  contentSecurityPolicyNonceDirectives: readonly string[] | null = null;
  private _permissionsPolicy: PermissionsPolicy | null = null;
  yjit = false;

  /** @internal */
  private _loadedConfigVersion: string | number | null = null;

  get loadedConfigVersion(): string | number | null {
    return this._loadedConfigVersion;
  }

  loadDefaults(targetVersion: string | number): void {
    switch (String(targetVersion)) {
      case "5.0": {
        if (this.isRespondTo("actionController")) {
          const actionController = this.get("actionController") as Record<string, unknown>;
          actionController.perFormCsrfTokens = true;
          actionController.forgeryProtectionOriginCheck = true;
        }

        if (this.isRespondTo("activeSupport")) {
          const activeSupport = this.get("activeSupport") as Record<string, unknown>;
          activeSupport.toTimePreservesTimezone = ":offset";
        }

        if (this.isRespondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.belongsToRequiredByDefault = true;
        }

        this.sslOptions = { hsts: { subdomains: true } };
        break;
      }
      case "5.1": {
        this.loadDefaults("5.0");

        if (this.isRespondTo("assets")) {
          const assets = this.get("assets") as Record<string, unknown>;
          assets.unknownAssetFallback = false;
        }

        if (this.isRespondTo("actionView")) {
          const actionView = this.get("actionView") as Record<string, unknown>;
          actionView.formWithGeneratesRemoteForms = true;
        }
        break;
      }
      case "5.2": {
        this.loadDefaults("5.1");

        if (this.isRespondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.cacheVersioning = true;
        }

        if (this.isRespondTo("actionDispatch")) {
          const actionDispatch = this.get("actionDispatch") as Record<string, unknown>;
          actionDispatch.useAuthenticatedCookieEncryption = true;
        }

        if (this.isRespondTo("activeSupport")) {
          const activeSupport = this.get("activeSupport") as Record<string, unknown>;
          activeSupport.useAuthenticatedMessageEncryption = true;
          activeSupport.hashDigestClass = OpenSSL.Digest.SHA1;
        }

        if (this.isRespondTo("actionController")) {
          const actionController = this.get("actionController") as Record<string, unknown>;
          actionController.defaultProtectFromForgery = true;
        }

        if (this.isRespondTo("actionView")) {
          const actionView = this.get("actionView") as Record<string, unknown>;
          actionView.formWithGeneratesIds = true;
        }
        break;
      }
      case "6.0": {
        this.loadDefaults("5.2");

        if (this.isRespondTo("actionView")) {
          const actionView = this.get("actionView") as Record<string, unknown>;
          actionView.defaultEnforceUtf8 = false;
        }

        if (this.isRespondTo("actionDispatch")) {
          const actionDispatch = this.get("actionDispatch") as Record<string, unknown>;
          actionDispatch.useCookiesWithMetadata = true;
        }

        if (this.isRespondTo("actionMailer")) {
          const actionMailer = this.get("actionMailer") as Record<string, unknown>;
          actionMailer.deliveryJob = "ActionMailer::MailDeliveryJob";
        }

        if (this.isRespondTo("activeStorage")) {
          const activeStorage = this.get("activeStorage") as { queues: Record<string, unknown> };
          activeStorage.queues.analysis = ":active_storage_analysis";
          activeStorage.queues.purge = ":active_storage_purge";
        }

        if (this.isRespondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.collectionCacheVersioning = true;
        }
        break;
      }
      case "6.1": {
        this.loadDefaults("6.0");

        if (this.isRespondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.hasManyInversing = true;
        }

        if (this.isRespondTo("activeJob")) {
          const activeJob = this.get("activeJob") as Record<string, unknown>;
          activeJob.retryJitter = 0.15;
        }

        if (this.isRespondTo("actionDispatch")) {
          const actionDispatch = this.get("actionDispatch") as Record<string, unknown>;
          actionDispatch.cookiesSameSiteProtection = ":lax";
          actionDispatch.sslDefaultRedirectStatus = 308;
        }

        if (this.isRespondTo("actionView")) {
          const actionView = this.get("actionView") as Record<string, unknown>;
          actionView.formWithGeneratesRemoteForms = false;
          actionView.preloadLinksHeader = true;
        }

        if (this.isRespondTo("activeStorage")) {
          const activeStorage = this.get("activeStorage") as {
            trackVariants?: unknown;
            queues: Record<string, unknown>;
          };
          activeStorage.trackVariants = true;

          activeStorage.queues.analysis = null;
          activeStorage.queues.purge = null;
        }

        if (this.isRespondTo("actionMailbox")) {
          const actionMailbox = this.get("actionMailbox") as { queues: Record<string, unknown> };
          actionMailbox.queues.incineration = null;
          actionMailbox.queues.routing = null;
        }

        if (this.isRespondTo("actionMailer")) {
          const actionMailer = this.get("actionMailer") as Record<string, unknown>;
          actionMailer.deliverLaterQueueName = null;
        }

        setUtcToLocalReturnsUtcOffsetTimes(true);
        break;
      }
      case "7.0": {
        this.loadDefaults("6.1");

        if (this.isRespondTo("actionDispatch")) {
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

        if (this.isRespondTo("actionView")) {
          const actionView = this.get("actionView") as Record<string, unknown>;
          actionView.buttonToGeneratesButtonTag = true;
          actionView.applyStylesheetMediaDefault = false;
        }

        if (this.isRespondTo("activeSupport")) {
          const activeSupport = this.get("activeSupport") as Record<string, unknown>;
          activeSupport.hashDigestClass = OpenSSL.Digest.SHA256;
          activeSupport.keyGeneratorHashDigestClass = OpenSSL.Digest.SHA256;
          activeSupport.cacheFormatVersion = 7.0;
          activeSupport.executorAroundTestCase = true;
        }

        if (this.isRespondTo("actionMailer")) {
          const actionMailer = this.get("actionMailer") as Record<string, unknown>;
          actionMailer.smtpTimeout = 5;
        }

        if (this.isRespondTo("activeStorage")) {
          const activeStorage = this.get("activeStorage") as Record<string, unknown>;
          activeStorage.videoPreviewArguments =
            "-vf 'select=eq(n\\,0)+eq(key\\,1)+gt(scene\\,0.015),loop=loop=-1:size=2,trim=start_frame=1'" +
            " -frames:v 1 -f image2";

          activeStorage.variantProcessor = ":vips";
          activeStorage.multipleFileFieldIncludeHidden = true;
        }

        if (this.isRespondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.verifyForeignKeysForFixtures = true;
          activeRecord.partialInserts = false;
          activeRecord.automaticScopeInversing = true;
        }

        if (this.isRespondTo("actionController")) {
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

        if (Trails.env["local?"]()) {
          this.logFileSize = 100 * 1024 * 1024;
        }

        if (this.isRespondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown> & {
            encryption: Record<string, unknown>;
          };
          activeRecord.runCommitCallbacksOnFirstSavedInstancesInTransaction = false;
          activeRecord.sqlite3AdapterStrictStringsByDefault = true;
          activeRecord.queryLogTagsFormat = "sqlcommenter";
          activeRecord.raiseOnAssignToAttrReadonly = true;
          activeRecord.belongsToRequiredValidatesForeignKey = false;
          activeRecord.beforeCommittedOnAllRecords = true;
          activeRecord.defaultColumnSerializer = null;
          activeRecord.encryption.hashDigestClass = OpenSSL.Digest.SHA256;
          activeRecord.encryption.supportSha1ForNonDeterministicEncryption = false;
          activeRecord.marshallingFormatVersion = 7.1;
          activeRecord.runAfterTransactionCallbacksInOrderDefined = true;
          activeRecord.generateSecureTokenOn = "initialize";
        }

        if (this.isRespondTo("actionDispatch")) {
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

        if (this.isRespondTo("activeSupport")) {
          const activeSupport = this.get("activeSupport") as Record<string, unknown>;
          activeSupport.cacheFormatVersion = 7.1;
          activeSupport.messageSerializer = ":json_allow_marshal";
          activeSupport.useMessageSerializerForMetadata = true;
          activeSupport.raiseOnInvalidCacheExpirationTime = true;
        }

        if (this.isRespondTo("actionView")) {
          /** @empty */
        }

        if (this.isRespondTo("actionText")) {
          /** @empty */
        }
        break;
      }
      case "7.2": {
        this.loadDefaults("7.1");

        this.yjit = true;

        if (this.isRespondTo("activeStorage")) {
          const activeStorage = this.get("activeStorage") as Record<string, unknown>;
          activeStorage.webImageContentTypes = [
            "image/png",
            "image/jpeg",
            "image/gif",
            "image/webp",
          ];
        }

        if (this.isRespondTo("activeRecord")) {
          const activeRecord = this.get("activeRecord") as Record<string, unknown>;
          activeRecord.postgresqlAdapterDecodeDates = true;
          activeRecord.validateMigrationTimestamps = true;
        }
        break;
      }
      case "8.0": {
        this.loadDefaults("7.2");

        if (this.isRespondTo("activeSupport")) {
          const activeSupport = this.get("activeSupport") as Record<string, unknown>;
          activeSupport.toTimePreservesTimezone = ":zone";
        }

        if (this.isRespondTo("actionDispatch")) {
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

  /** @missingRailsCall application — CONVERGEABLE secret-key-base-credentials-arm */
  get secretKeyBase(): string {
    return (
      this._secretKeyBase ??
      ((this.secretKeyBase =
        getEnv("SECRET_KEY_BASE_DUMMY") != null
          ? this.generateLocalSecret()
          : (getEnv("SECRET_KEY_BASE") ??
            (Trails.env["local?"]() && this.generateLocalSecret()))) as string)
    );
  }

  set secretKeyBase(newSecretKeyBase: unknown) {
    if (newSecretKeyBase == null && Trails.env["local?"]()) {
      this._secretKeyBase = this.generateLocalSecret();
    } else if (typeof newSecretKeyBase === "string" && isPresent(newSecretKeyBase)) {
      this._secretKeyBase = newSecretKeyBase;
    } else if (newSecretKeyBase != null && newSecretKeyBase !== false) {
      throw new ArgumentError(
        `\`secret_key_base\` for ${Trails.env} environment must be a type of String\``,
      );
    } else {
      throw new ArgumentError(
        `Missing \`secret_key_base\` for '${Trails.env}' environment, set this string with \`bin/rails credentials:edit\``,
      );
    }
  }

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

  isSessionStore(): unknown {
    return this._sessionStore;
  }

  contentSecurityPolicy(
    block?: (policy: ContentSecurityPolicy) => void,
  ): ContentSecurityPolicy | null {
    if (block) {
      return (this._contentSecurityPolicy = new ContentSecurityPolicy(block));
    } else {
      return this._contentSecurityPolicy;
    }
  }

  permissionsPolicy(block?: (policy: PermissionsPolicy) => void): PermissionsPolicy | null {
    if (block) {
      return (this._permissionsPolicy = new PermissionsPolicy(block));
    } else {
      return this._permissionsPolicy;
    }
  }

  get sessionOptions(): Record<string, unknown> {
    return this._sessionOptions;
  }
  set sessionOptions(value: Record<string, unknown>) {
    this._sessionOptions = value;
  }

  get apiOnly(): boolean {
    return this._apiOnly;
  }
  set apiOnly(value: boolean) {
    this._apiOnly = value;
    this._debugExceptionResponseFormat ??= "api";
  }

  get debugExceptionResponseFormat(): "default" | "api" {
    return this._debugExceptionResponseFormat ?? "default";
  }
  set debugExceptionResponseFormat(value: "default" | "api" | null) {
    this._debugExceptionResponseFormat = value;
  }

  get enableReloading(): boolean {
    return !this.cacheClasses;
  }
  set enableReloading(value: boolean) {
    this.cacheClasses = !value;
  }
  isReloadingEnabled(): boolean {
    return this.enableReloading;
  }

  override paths(): Root {
    const paths = super.paths();
    if (!paths.get("config/environment"))
      paths.add("config/environment", { with: "config/environment.ts" });
    if (!paths.get("lib/templates")) paths.add("lib/templates");
    if (!paths.get("public")) paths.add("public");
    if (!paths.get("public/javascripts")) paths.add("public/javascripts");
    if (!paths.get("public/stylesheets")) paths.add("public/stylesheets");
    return paths;
  }

  /** @internal */
  async credentialsDefaults(): Promise<{ contentPath: string; keyPath: string }> {
    const root = this.root as string;
    let contentPath = getPath().join(root, `config/credentials/${Trails.env}.yml.enc`);
    if (!(await getFs().exists(contentPath)))
      contentPath = getPath().join(root, "config/credentials.yml.enc");

    let keyPath = getPath().join(root, `config/credentials/${Trails.env}.key`);
    if (!(await getFs().exists(keyPath))) keyPath = getPath().join(root, "config/master.key");

    return { contentPath: contentPath, keyPath: keyPath };
  }

  /** @noRailsEquivalent PERMANENT */
  async loadLocalSecret(): Promise<string> {
    const keyFile = getPath().join(this.root as string, "tmp/local_secret.txt");

    if (!(await getFs().exists(keyFile))) {
      const randomKey = SecureRandom.hex(64);
      await getFs().mkdir!(getPath().dirname(keyFile), { recursive: true });
      await getFs().writeFile!(keyFile, randomKey);
    }

    return (this._localSecret = await getFs().readFile(keyFile, "utf8"));
  }

  private generateLocalSecret(): string {
    if (this._localSecret === undefined) {
      throw new RuntimeError(
        "tmp/local_secret.txt is not loaded; await Application#initialize first",
      );
    }
    return this._localSecret;
  }
}

export class Custom {
  [configuration: string]: any;
  #configurations: Map<string, unknown>;

  constructor() {
    this.#configurations = new Map();
    return new Proxy(this, {
      get(target, method, receiver) {
        if (typeof method === "symbol" || method in target) {
          return Reflect.get(target, method, receiver);
        }
        return target.methodMissing(method);
      },
      set(target, method, value, receiver) {
        if (typeof method === "symbol" || method in target) {
          return Reflect.set(target, method, value, receiver);
        }
        target.methodMissing(`${method}=`, value);
        return true;
      },
      has(target, method) {
        return typeof method === "symbol"
          ? method in target
          : target.respondToMissing(method, false);
      },
    });
  }

  methodMissing(method: string, ...args: unknown[]): unknown {
    if (method.endsWith("=")) {
      this.#configurations.set(method.slice(0, -1), args[0]);
      return args[0];
    } else if (args.length === 0) {
      if (!this.#configurations.has(method)) this.#configurations.set(method, new OrderedOptions());
      return this.#configurations.get(method);
    } else {
      throw new ArgumentError(
        `wrong number of arguments (given ${args.length}, expected 0) when reading configuration \`${method}\``,
      );
    }
  }

  respondToMissing(_symbol: string, _includePrivate: boolean): boolean {
    return true;
  }
}
