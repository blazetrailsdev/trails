import type { MessageDelivery } from "@blazetrails/actionmailer";
import { ApplicationMailer } from "./application-mailer.ts";
import type { User } from "../models/user.ts";

export class MagicLinksMailer extends ApplicationMailer {
  declare static signIn: (user: User) => MessageDelivery;
  declare user: User;
  declare token: string;

  async signIn(user: User): Promise<void> {
    this.user = user;
    this.token = user.generateTokenFor("magic_link");
    await this.mail({ to: user.email_address, subject: "Your Chatter sign-in link" });
  }
}
