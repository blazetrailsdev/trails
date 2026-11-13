import type { Mapper, RouteSet } from "@blazetrails/actionpack";
import { TopLevel } from "@blazetrails/activesupport";

(TopLevel.Trails!.application!.routes() as unknown as RouteSet).draw(function (this: Mapper) {
  this.scope(
    "/trails/action_mailbox",
    { module: "action_mailbox/ingresses" },
    function (this: Mapper) {
      this.post("/postmark/inbound_emails", {
        to: "postmark/inbound_emails#create",
        as: "trails_postmark_inbound_emails",
      });
      this.post("/relay/inbound_emails", {
        to: "relay/inbound_emails#create",
        as: "trails_relay_inbound_emails",
      });
      this.post("/sendgrid/inbound_emails", {
        to: "sendgrid/inbound_emails#create",
        as: "trails_sendgrid_inbound_emails",
      });

      this.get("/mandrill/inbound_emails", {
        to: "mandrill/inbound_emails#healthCheck",
        as: "trails_mandrill_inbound_health_check",
      });
      this.post("/mandrill/inbound_emails", {
        to: "mandrill/inbound_emails#create",
        as: "trails_mandrill_inbound_emails",
      });

      this.post("/mailgun/inbound_emails/mime", {
        to: "mailgun/inbound_emails#create",
        as: "trails_mailgun_inbound_emails",
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
