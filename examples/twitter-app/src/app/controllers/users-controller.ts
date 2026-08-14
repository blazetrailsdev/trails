import { createHash } from "node:crypto";
import type { Parameters as StrongParameters } from "@blazetrails/actionpack";
import { ApplicationController } from "./application-controller.js";
import { User } from "../models/user.js";

/**
 * TODO(0104-twitter-app-full-stack-integration/has-secure-password-unported):
 * Rails' `has_secure_password` (bcrypt) has no trails counterpart yet, so
 * this example hashes with a salted SHA-256. Adequate to demonstrate the
 * sign-up / log-in flow; not a password scheme to copy into production.
 */
export function digestPassword(password: string): string {
  return createHash("sha256").update(`twitter-app$${password}`).digest("hex");
}

export class UsersController extends ApplicationController {
  async new(): Promise<void> {
    this.render({
      action: "new",
      locals: { ...(await this.layoutLocals()), user: User.new(), errors: [] },
    });
  }

  async create(): Promise<void> {
    const params = this.userParams();
    const password = String(params.password ?? "");
    const user = User.new({
      handle: params.handle,
      display_name: params.display_name,
      bio: params.bio ?? "",
      password_digest: digestPassword(password),
    });

    // Validate the record first so its own errors are collected, then add the
    // password error, so the form shows every problem at once rather than one
    // at a time. Rails gets this for free from `has_secure_password`.
    const valid = await user.isValid();
    if (password.length < 6) {
      user.errors.add("password", "must be at least 6 characters");
    } else if (valid && (await user.save())) {
      this.logIn(user);
      this.setFlash("notice", `Welcome, @${user.handle}!`);
      this.redirectTo("/");
      return;
    }

    this.render({
      action: "new",
      status: 422,
      locals: { ...(await this.layoutLocals()), user, errors: user.errors.fullMessages },
    });
  }

  async show(): Promise<void> {
    const user = await this.profile();
    if (!user) return this.notFound();

    this.render({
      action: "show",
      locals: {
        ...(await this.layoutLocals()),
        user,
        tweets: await user.tweets.order({ created_at: "desc" }).includes("user"),
        followerCount: await user.followers.count(),
        followingCount: await user.following.count(),
        isFollowing: await this.isFollowing(user),
      },
    });
  }

  async following(): Promise<void> {
    const user = await this.profile();
    if (!user) return this.notFound();

    this.render({
      action: "following",
      locals: { ...(await this.layoutLocals()), user, users: await user.following },
    });
  }

  async followers(): Promise<void> {
    const user = await this.profile();
    if (!user) return this.notFound();

    this.render({
      action: "followers",
      locals: { ...(await this.layoutLocals()), user, users: await user.followers },
    });
  }

  /** The profile being viewed, addressed by handle. */
  private async profile(): Promise<User | null> {
    return User.findBy({ handle: String(this.params.get("handle")) });
  }

  /** Does the signed-in user already follow `user`? */
  private async isFollowing(user: User): Promise<boolean> {
    const me = await this.currentUser();
    if (!me || me.id === user.id) return false;
    // `count()` widens to `number | Map` for the grouped form; this one is ungrouped.
    return Number(await me.activeFollows.where({ followee_id: user.id }).count()) > 0;
  }

  /** Rails: `params.require(:user).permit(:handle, :display_name, :bio, :password)`. */
  private userParams(): Record<string, unknown> {
    const user = this.params.require("user") as StrongParameters;
    return user.permit("handle", "display_name", "bio", "password").toHash();
  }

  private notFound(): void {
    this.render({ plain: "No such user", status: 404 });
  }
}
