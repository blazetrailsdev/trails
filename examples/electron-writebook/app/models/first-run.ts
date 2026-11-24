import type { Parameters } from "@blazetrails/actionpack";
import { ApplicationRecord } from "./application-record.ts";
import { Account } from "./account.ts";
import { EmbedProvider } from "./embed-provider.ts";
import { User } from "./user.ts";

export class FirstRun {
  static ACCOUNT_NAME = "Writebook";

  static async createBang(userParams: Parameters): Promise<User> {
    const administrator = new User(userParams.merge({ role: "administrator" }));

    await ApplicationRecord.transaction(async () => {
      await Account.createBang({
        name: FirstRun.ACCOUNT_NAME,
        embed_providers: EmbedProvider.DEFAULTS,
      });
      await administrator.saveBang();
    });

    return administrator;
  }
}
