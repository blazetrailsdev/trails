import { GeneratorBase, type GeneratorOptions } from "../../base.js";
import {
  ref,
  tsBody,
  tsClass,
  tsMethod,
  tsModule,
  type Method,
  type Ref,
} from "../../../template-builder/index.js";

export interface AuthenticationRunOptions {
  api?: boolean;
  skipMailer?: boolean;
}

const APP_RECORD = ref("ApplicationRecord", "./application-record.js");
const APP_CONTROLLER = ref("ApplicationController", "../application-controller.js");
const APP_MAILER = ref("ApplicationMailer", "./application-mailer.js");
const CURRENT_ATTRS = ref("ActiveSupport.CurrentAttributes");
const PRIVATE = { visibility: "private" } as const;

// Mirrors railties/lib/rails/generators/rails/authentication/authentication_generator.rb.
export class AuthenticationGenerator extends GeneratorBase {
  constructor(options: GeneratorOptions) {
    super(options);
  }

  run(options: AuthenticationRunOptions = {}): string[] {
    const { api = false, skipMailer = false } = options;
    this.emit("src/app/models/session.ts", "Session", APP_RECORD, [
      stub("associations", "// belongsTo: User", { static: true }),
    ]);
    this.emit("src/app/models/user.ts", "User", APP_RECORD, [
      stub("associations", "// hasSecurePassword; hasMany sessions, dependent: destroy", {
        static: true,
      }),
      stub("normalizes", "// emailAddress → e.strip().toLowerCase()", { static: true }),
    ]);
    this.createFile("src/app/models/current.ts", currentModel());
    this.emit("src/app/controllers/sessions-controller.ts", "SessionsController", APP_CONTROLLER, [
      asyncStub("new_", "// allowUnauthenticatedAccess only: [new_, create]"),
      asyncStub("create", "// User.authenticateBy → startNewSessionFor → redirect"),
      asyncStub("destroy", "// terminateSession → redirect to /session/new"),
    ]);
    this.createFile("src/app/controllers/concerns/authentication.ts", authenticationConcern());
    this.emit(
      "src/app/controllers/passwords-controller.ts",
      "PasswordsController",
      APP_CONTROLLER,
      [
        asyncStub("new_", "// allowUnauthenticatedAccess"),
        asyncStub("create", "// PasswordsMailer.reset(user).deliverLater"),
        asyncStub("edit", "// setUserByToken"),
        asyncStub("update", "// user.update(password, passwordConfirmation)"),
        asyncStub("setUserByToken", "// User.findByPasswordResetTokenBang", PRIVATE),
      ],
    );
    // ActionCable stub — full Connection extending ActionCable.Connection.Base
    // lands when @blazetrails/actioncable is ported.
    this.emit("src/app/channels/application-cable/connection.ts", "Connection", undefined, [
      stub("identifiedBy", "// currentUser", { static: true }),
      asyncStub("connect", "// setCurrentUser || rejectUnauthorizedConnection"),
      asyncStub("setCurrentUser", "// Session.findBy(cookies.signed.sessionId)", PRIVATE),
    ]);

    if (!skipMailer) {
      this.emit("src/app/mailers/passwords-mailer.ts", "PasswordsMailer", APP_MAILER, [
        asyncStub("reset", '// mail subject: "Reset your password", to: user.emailAddress', {
          param: "user",
        }),
      ]);
      this.emit(
        "test/mailers/previews/passwords-mailer-preview.ts",
        "PasswordsMailerPreview",
        undefined,
        [stub("reset", "// TODO: preview PasswordsMailer.reset")],
      );
      if (!api) {
        this.createFile("src/app/views/passwords-mailer/reset.html.tse", RESET_HTML);
        this.createFile("src/app/views/passwords-mailer/reset.text.tse", RESET_TEXT);
      }
    }

    this.configureApplicationController();
    this.configureAuthenticationRoutes();
    return this.getCreatedFiles();
  }

  private emit(file: string, name: string, ext: Ref | undefined, body: Method[]): void {
    this.createFile(
      file,
      tsModule({ declarations: [tsClass({ name, ...(ext ? { extends: ext } : {}), body })] }),
    );
  }

  // Mirrors Rails' `inject_into_class "application_controller.rb",
  // "ApplicationController", "  include Authentication\n"` — the mixin call
  // lands inside the class body via a static initializer; the import joins
  // the existing imports above the class.
  private configureApplicationController(): void {
    const file = "src/app/controllers/application-controller.ts";
    if (!this.fileExists(file)) return;
    this.insertIntoFile(
      file,
      "export class ApplicationController",
      `import { Authentication } from "./concerns/authentication.js";\n\n`,
    );
    this.insertIntoFile(file, "\n}\n", `  static {\n    Authentication.includeInto(this);\n  }\n`);
  }

  private configureAuthenticationRoutes(): void {
    const routesFile = this.fileExists("src/config/routes.ts")
      ? "src/config/routes.ts"
      : this.fileExists("src/config/routes.js")
        ? "src/config/routes.js"
        : null;
    if (!routesFile) return;
    this.insertIntoFile(
      routesFile,
      "// routes",
      `  router.resources("passwords", { param: "token" });\n  router.resource("session");\n`,
    );
  }
}

function currentModel(): string {
  return tsModule({
    imports: [{ from: "@blazetrails/activesupport", named: { ActiveSupport: "ActiveSupport" } }],
    declarations: [
      tsClass({
        name: "Current",
        extends: CURRENT_ATTRS,
        body: [stub("attributes", "// attribute :session", { static: true })],
      }),
    ],
  });
}

function authenticationConcern(): string {
  // The Authentication "concern" is emitted as a class with static helpers.
  // `Authentication.includeInto(klass)` wires the `requireAuthentication`
  // beforeAction + `authenticated` helper hook; full instance-method mixin
  // semantics arrive when actionpack ships its include() primitive.
  return tsModule({
    declarations: [
      tsClass({
        name: "Authentication",
        body: [
          tsMethod({
            name: "includeInto",
            params: [{ name: "klass", type: "any" }],
            static: true,
            body: tsBody`klass.beforeAction?.("requireAuthentication");\nklass.helperMethod?.("authenticated");`,
          }),
          asyncStub("authenticated", "// resumeSession"),
          asyncStub("requireAuthentication", "// resumeSession || requestAuthentication"),
          asyncStub("resumeSession", "// Current.session ||= findSessionByCookie", PRIVATE),
          asyncStub("findSessionByCookie", "// Session.findBy(cookies.signed.sessionId)", PRIVATE),
          asyncStub("startNewSessionFor", "// user.sessions.createBang + cookie", {
            ...PRIVATE,
            param: "user",
          }),
          asyncStub("terminateSession", "// Current.session.destroy + cookies.delete", PRIVATE),
        ],
      }),
    ],
  });
}

interface StubOpts {
  static?: boolean;
  visibility?: "private" | "protected";
  param?: string;
  async?: boolean;
}

function stub(name: string, comment: string, opts: StubOpts = {}): Method {
  return tsMethod({
    name,
    params: opts.param ? [{ name: opts.param, type: "any" }] : [],
    static: opts.static,
    visibility: opts.visibility,
    async: opts.async,
    returnType: opts.async ? "Promise<void>" : undefined,
    body: tsBody`${comment}`,
  });
}

const asyncStub = (name: string, comment: string, opts: StubOpts = {}): Method =>
  stub(name, comment, { ...opts, async: true });

const RESET_HTML = `<p>
  You can reset your password within the next 15 minutes on
  <%= linkTo("this password reset page", editPasswordUrl(user.passwordResetToken)) %>.
</p>
`;

const RESET_TEXT = `You can reset your password within the next 15 minutes on this password reset page:
<%= editPasswordUrl(user.passwordResetToken) %>
`;
