import type { Mapper, RouteSet } from "@blazetrails/actionpack";
import { TopLevel } from "@blazetrails/activesupport";

(TopLevel.Trails!.application!.routes() as unknown as RouteSet).draw(function (this: Mapper) {
  this.scope(
    "/trails/action_mailbox",
    { module: "action_mailbox/ingresses" },
    function (this: Mapper) {
      this.post("/relay/inbound_emails", {
        to: "relay/inbound_emails#create",
        as: "trails_relay_inbound_emails",
      });
    },
  );

  this.scope(
    "trails/conductor/action_mailbox/",
    { module: "trails/conductor/action_mailbox" },
    function (this: Mapper) {
      this.resources("inbound_emails", {
        as: "trails_conductor_inbound_emails",
        only: ["index", "new", "show", "create"],
      });
      this.get("inbound_emails/sources/new", {
        to: "inbound_emails/sources#new",
        as: "new_trails_conductor_inbound_email_source",
      });
      this.post("inbound_emails/sources", {
        to: "inbound_emails/sources#create",
        as: "trails_conductor_inbound_email_sources",
      });

      this.post(":inbound_email_id/reroute", {
        to: "reroutes#create",
        as: "trails_conductor_inbound_email_reroute",
      });
      this.post(":inbound_email_id/incinerate", {
        to: "incinerates#create",
        as: "trails_conductor_inbound_email_incinerate",
      });
    },
  );
});
