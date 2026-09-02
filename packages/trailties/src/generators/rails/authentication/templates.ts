/**
 * The generator's templates, mirroring
 * `railties/lib/rails/generators/rails/authentication/templates/**.tt` — the
 * one shape a TypeScript package can carry them in.
 *
 * @noRailsEquivalent PERMANENT
 */

export const SESSION = `import { ApplicationRecord } from "./application-record.js";

export class Session extends ApplicationRecord {
  static {
    this.belongsTo("user");
  }
}
`;

export const USER = `import { ApplicationRecord } from "./application-record.js";

export class User extends ApplicationRecord {
  static {
    this.hasSecurePassword();
    this.hasMany("sessions", { dependent: "destroy" });

    this.normalizes("email_address", { with: (e: string) => e.trim().toLowerCase() });
  }
}
`;

export const CURRENT = `import { CurrentAttributes, delegate } from "@blazetrails/activesupport";

export class Current extends CurrentAttributes {
  static {
    this.attribute("session");
    delegate(this.prototype, ["user"], { to: "session", allowNil: true });
  }
}
`;

export const AUTHENTICATION = `import { defineModule, extend, included } from "@blazetrails/activesupport";
import { Current } from "../../models/current.js";
import { Session } from "../../models/session.js";

/** Rails' \`class_methods do ... end\` block. */
export const ClassMethods = {
  allowUnauthenticatedAccess(this: any, options: Record<string, unknown> = {}): void {
    this.skipBeforeAction("requireAuthentication", options);
  },
};

export const Authentication = defineModule(
  {
    [included](base: any): void {
      extend(base, ClassMethods);
      base.beforeAction("requireAuthentication");
      base.helperMethod("authenticated");
    },
  },
  undefined,
  {
    async authenticated(this: any): Promise<unknown> {
      return await this.resumeSession();
    },

    async requireAuthentication(this: any): Promise<unknown> {
      return (await this.resumeSession()) || this.requestAuthentication();
    },

    async resumeSession(this: any): Promise<unknown> {
      return (Current.session ??= await this.findSessionByCookie());
    },

    async findSessionByCookie(this: any): Promise<unknown> {
      // Rails signs a permanent \`session_id\` cookie
      // (authentication.rb.tt \`find_session_by_cookie\`); trails'
      // \`ActionController::Base#cookies\` is still the request's read-only
      // cookie hash rather than \`request.cookie_jar\`, so the session id
      // rides the controller session until that converges.
      const sessionId = this.session["session_id"];
      return sessionId ? await Session.findBy({ id: sessionId }) : null;
    },

    requestAuthentication(this: any): void {
      this.session["return_to_after_authenticating"] = this.request.url;
      this.redirectTo("/session/new");
    },

    afterAuthenticationUrl(this: any): string {
      const url = this.session["return_to_after_authenticating"];
      delete this.session["return_to_after_authenticating"];
      return url || "/";
    },

    async startNewSessionFor(this: any, user: any): Promise<unknown> {
      const session = await user.sessions.createBang({
        user_agent: this.request.getHeader("HTTP_USER_AGENT"),
        ip_address: this.request.remoteIp,
      });
      Current.session = session;
      this.session["session_id"] = session.id;
      return session;
    },

    async terminateSession(this: any): Promise<void> {
      await (Current.session as any).destroy();
      delete this.session["session_id"];
    },
  },
);
`;

export const SESSIONS_CONTROLLER = `import { minutes } from "@blazetrails/activesupport";
import { ApplicationController } from "./application-controller.js";
import { User } from "../models/user.js";

export class SessionsController extends ApplicationController {
  static {
    (this as any).allowUnauthenticatedAccess({ only: ["new_", "create"] });
    this.rateLimit({
      to: 10,
      within: minutes(3),
      only: "create",
      with: function (this: SessionsController) {
        this.redirectTo("/session/new");
      },
    });
  }

  async new_(): Promise<void> {
    this.render({ action: "new" });
  }

  async create(): Promise<void> {
    const user = await User.authenticateBy(this.params.permit("email_address", "password"));
    if (user) {
      await (this as any).startNewSessionFor(user);
      this.redirectTo((this as any).afterAuthenticationUrl());
    } else {
      this.redirectTo("/session/new");
    }
  }

  async destroy(): Promise<void> {
    await (this as any).terminateSession();
    this.redirectTo("/session/new");
  }
}
`;

export const PASSWORDS_CONTROLLER = `import { ApplicationController } from "./application-controller.js";
import { User } from "../models/user.js";
import { PasswordsMailer } from "../mailers/passwords-mailer.js";

export class PasswordsController extends ApplicationController {
  static {
    (this as any).allowUnauthenticatedAccess();
    this.beforeAction("setUserByToken", { only: ["edit", "update"] });
  }

  declare user: any;

  async new_(): Promise<void> {
    this.render({ action: "new" });
  }

  async create(): Promise<void> {
    const user = await User.findBy({ email_address: this.params.get("email_address") });
    if (user) {
      await PasswordsMailer.reset(user).deliverLater();
    }

    this.redirectTo("/session/new");
  }

  async edit(): Promise<void> {
    this.render({ action: "edit" });
  }

  async update(): Promise<void> {
    if (await this.user.update(this.params.permit("password", "password_confirmation"))) {
      this.redirectTo("/session/new");
    } else {
      this.redirectTo(\`/passwords/\${this.params.get("token")}/edit\`);
    }
  }

  protected async setUserByToken(): Promise<void> {
    try {
      this.user = await User.findByPasswordResetTokenBang(this.params.get("token"));
    } catch {
      this.redirectTo("/passwords/new");
    }
  }
}
`;

export const CONNECTION = `import { Session } from "../../models/session.js";

export class Connection {
  declare currentUser: unknown;
  declare cookies: Record<string, string>;
  declare rejectUnauthorizedConnection: () => void;

  async connect(): Promise<void> {
    if (!(await this.setCurrentUser())) this.rejectUnauthorizedConnection();
  }

  protected async setCurrentUser(): Promise<unknown> {
    const session = await Session.findBy({ id: this.cookies["session_id"] });
    if (session) {
      this.currentUser = await session.user;
      return this.currentUser;
    }
    return null;
  }
}
`;

export const PASSWORDS_MAILER = `import { ApplicationMailer } from "./application-mailer.js";

export class PasswordsMailer extends ApplicationMailer {
  static reset(user: any): PasswordsMailer {
    const mailer = new PasswordsMailer();
    mailer.user = user;
    return mailer.mail({ subject: "Reset your password", to: user.email_address });
  }

  declare user: any;
}
`;

export const PASSWORDS_MAILER_PREVIEW = `import { PasswordsMailer } from "../../../app/mailers/passwords-mailer.js";
import { User } from "../../../app/models/user.js";

export class PasswordsMailerPreview {
  async reset(): Promise<unknown> {
    return PasswordsMailer.reset(await User.take());
  }
}
`;

export const RESET_HTML = `<p>
  You can reset your password within the next 15 minutes on
  <%= linkTo("this password reset page", editPasswordUrl(user.passwordResetToken)) %>.
</p>
`;

export const RESET_TEXT = `You can reset your password within the next 15 minutes on this password reset page:
<%= editPasswordUrl(user.passwordResetToken) %>
`;

/** Rails template path → its source, keyed as `template` names them. */
export const TEMPLATES: Record<string, string> = {
  "app/models/session.rb": SESSION,
  "app/models/user.rb": USER,
  "app/models/current.rb": CURRENT,
  "app/controllers/sessions_controller.rb": SESSIONS_CONTROLLER,
  "app/controllers/concerns/authentication.rb": AUTHENTICATION,
  "app/controllers/passwords_controller.rb": PASSWORDS_CONTROLLER,
  "app/channels/application_cable/connection.rb": CONNECTION,
  "app/mailers/passwords_mailer.rb": PASSWORDS_MAILER,
  "app/views/passwords_mailer/reset.html.erb": RESET_HTML,
  "app/views/passwords_mailer/reset.text.erb": RESET_TEXT,
  "test/mailers/previews/passwords_mailer_preview.rb": PASSWORDS_MAILER_PREVIEW,
};
