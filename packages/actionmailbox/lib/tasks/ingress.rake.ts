import { isBlank } from "@blazetrails/activesupport";
import { DSL } from "@blazetrails/rake";
import { STDIN, block, env as ENV, exit, print, stdout as $stdout } from "@blazetrails/ruby-compat";
import { ActionMailbox } from "../action-mailbox.js";

await DSL.namespace("action_mailbox", async () => {
  await DSL.namespace("ingress", async () => {
    DSL.task(
      "environment",
      block(async () => {
        await import("@blazetrails/activesupport");
        await import("../relayer.js");
      }),
    );

    DSL.desc(
      "Relay an inbound email from Exim to Action Mailbox (URL and INGRESS_PASSWORD required)",
    );
    DSL.task(
      { exim: "action_mailbox:ingress:environment" },
      block(async () => {
        const [url, password] = [ENV["URL"], ENV["INGRESS_PASSWORD"]];

        if (isBlank(url) || isBlank(password)) {
          print.call($stdout, "URL and INGRESS_PASSWORD are required");
          exit(64);
        }

        const result = await new ActionMailbox.Relayer({ url: url!, password: password! }).relay(
          (await STDIN.readAsync()) as string,
        );
        print.call($stdout, result.message);

        if (result.isSuccess()) {
          exit(0);
        } else if (result.isTransientFailure()) {
          exit(75);
        } else {
          exit(69);
        }
      }),
    );

    DSL.desc(
      "Relay an inbound email from Postfix to Action Mailbox (URL and INGRESS_PASSWORD required)",
    );
    DSL.task(
      { postfix: "action_mailbox:ingress:environment" },
      block(async () => {
        const [url, password] = [ENV["URL"], ENV["INGRESS_PASSWORD"]];

        if (isBlank(url) || isBlank(password)) {
          print.call($stdout, "4.3.5 URL and INGRESS_PASSWORD are required");
          exit(1);
        }

        const result = await new ActionMailbox.Relayer({ url: url!, password: password! }).relay(
          (await STDIN.readAsync()) as string,
        );
        print.call($stdout, `${result.statusCode} ${result.message}`);
        exit(result.isSuccess());
      }),
    );

    DSL.desc(
      "Relay an inbound email from Qmail to Action Mailbox (URL and INGRESS_PASSWORD required)",
    );
    DSL.task(
      { qmail: "action_mailbox:ingress:environment" },
      block(async () => {
        const [url, password] = [ENV["URL"], ENV["INGRESS_PASSWORD"]];

        if (isBlank(url) || isBlank(password)) {
          print.call($stdout, "URL and INGRESS_PASSWORD are required");
          exit(111);
        }

        const result = await new ActionMailbox.Relayer({ url: url!, password: password! }).relay(
          (await STDIN.readAsync()) as string,
        );
        print.call($stdout, result.message);

        if (result.isSuccess()) {
          exit(0);
        } else if (result.isTransientFailure()) {
          exit(111);
        } else {
          exit(100);
        }
      }),
    );
  });
});
