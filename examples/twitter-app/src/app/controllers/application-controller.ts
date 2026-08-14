import { ActionController, FlashHash } from "@blazetrails/actionpack";
import { timeAgoInWords } from "@blazetrails/actionview";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { User } from "../models/user.js";

const SESSION_COOKIE = "_twitter_app_session";

/**
 * TODO(0104-twitter-app-full-stack-integration/session-and-flash-lifecycle):
 * this whole session/flash layer belongs in the framework, not the app.
 *
 * `ActionDispatch`'s session stores cannot run as middleware —
 * `middleware/session/abstract-store.ts` has no `call(env)`, only
 * `NotImplementedError` strategy hooks — so `request.session` is always the
 * empty object and `flash` never commits. Until that lands, the app signs its
 * own session cookie with `ActiveSupport::MessageVerifier` (the same
 * primitive `CookieStore` would use) and carries the flash inside it.
 *
 * Everything above this line is a workaround. Everything below — filters,
 * strong params, `redirectTo`, `render` — is the real framework.
 */
const verifier = new MessageVerifier(
  process.env.SECRET_KEY_BASE ?? "twitter-app-development-secret",
);

interface SessionData {
  userId?: number;
  /** Flash set by the previous request, to be shown on this one. */
  flash?: Record<string, string>;
}

export class ApplicationController extends ActionController.Base {
  /** Session read off the signed cookie, lazily. */
  private _session?: SessionData;
  /** Flash written during this request, for the next one. */
  private _nextFlash: Record<string, string> = {};
  private _flashLoaded = false;
  private _currentUser?: User | null;

  /**
   * Locals every template gets, including the layout.
   *
   * TODO(0104-twitter-app-full-stack-integration/helper-methods-not-in-tse-scope):
   * in Rails these would be `helper_method :current_user` and read as bare
   * identifiers in the view. `Tse#render` builds its scope from the locals
   * plus a fixed helper set, not from the controller's view context, so
   * `helper_method` is invisible to a `.tse` template and they have to be
   * passed by hand.
   */
  /**
   * `ActionView::Helpers::DateHelper#time_ago_in_words`, passed as a local
   * because helpers are not in a `.tse` template's scope yet — see the
   * helper-methods story.
   */
  protected timeAgo(value: unknown): string {
    if (value == null) return "";
    // TODO(0104-twitter-app-full-stack-integration/date-helpers-reject-temporal-instant):
    // ActiveRecord hands back a `Temporal.Instant` for a datetime column, and
    // `DistanceOfTimeInput` accepts only `Date | number | {toDate} | {toTime}`,
    // so the two halves need converting by hand.
    const epochMs = (value as { epochMilliseconds?: number }).epochMilliseconds;
    const date = epochMs != null ? new Date(epochMs) : new Date(String(value));
    return timeAgoInWords(date);
  }

  protected async layoutLocals(): Promise<Record<string, unknown>> {
    const user = await this.currentUser();
    return {
      currentUser: user,
      isLoggedIn: user != null,
      timeAgo: (value: unknown) => this.timeAgo(value),
      notice: this.readFlash().get("notice") ?? null,
      alert: this.readFlash().get("alert") ?? null,
    };
  }

  get twitterSession(): SessionData {
    if (this._session) return this._session;
    const raw = this.request?.cookies?.[SESSION_COOKIE];
    let data: SessionData = {};
    if (raw != null && raw !== "") {
      try {
        data = (verifier.verify(decodeURIComponent(raw)) as SessionData) ?? {};
      } catch {
        // Tampered or stale cookie — start a fresh session, as CookieStore does.
        data = {};
      }
    }
    return (this._session = data);
  }

  /**
   * Seed the framework's `FlashHash` from the cookie, once per request, so
   * actions and `layoutLocals` read `this.flash` exactly as in Rails.
   */
  private readFlash(): FlashHash {
    if (!this._flashLoaded) {
      this._flashLoaded = true;
      this.flash = new FlashHash(this.twitterSession.flash ?? {});
    }
    return this.flash;
  }

  /** Rails: `flash[:notice] = ...` — shown on the *next* request. */
  setFlash(key: string, message: string): void {
    this._nextFlash[key] = message;
  }

  async currentUser(): Promise<User | null> {
    if (this._currentUser !== undefined) return this._currentUser;
    const id = this.twitterSession.userId;
    return (this._currentUser = id == null ? null : await User.findBy({ id }));
  }

  isLoggedIn(): boolean {
    return this.twitterSession.userId != null;
  }

  logIn(user: User): void {
    this.twitterSession.userId = (user as unknown as { id: number }).id;
    this._currentUser = user;
  }

  logOut(): void {
    this._session = {};
    this._currentUser = null;
  }

  /**
   * Rails: `before_action :require_login`. Halts the chain by returning
   * false, which is how trails' `AbstractController::Callbacks` spells
   * Rails' `throw :abort` for a `before_action`.
   */
  requireLogin(): boolean {
    if (this.isLoggedIn()) return true;
    this.setFlash("alert", "Please log in first.");
    this.redirectTo("/login");
    return false;
  }

  /**
   * Write the session cookie after the action has run. Called by every
   * action path via {@link ApplicationController.processAction}.
   */
  private commitSession(): void {
    const data: SessionData = { ...this.twitterSession };
    if (Object.keys(this._nextFlash).length > 0) {
      data.flash = this._nextFlash;
    } else {
      // The flash is single-use: having been read this request, it must not
      // survive into the next one.
      delete data.flash;
    }
    const value = encodeURIComponent(verifier.generate(data));
    this.setHeader("set-cookie", `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax`);
  }

  override async processAction(action: string, ...args: unknown[]): Promise<void> {
    await super.processAction(action, ...args);
    this.commitSession();
  }
}
