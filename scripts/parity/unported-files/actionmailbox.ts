import type { UnportedFile } from "./types.js";

export const ACTIONMAILBOX_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "ingresses/mailgun/inbound_emails_controller.rb",
    testFile: "controllers/ingresses/mailgun/inbound_emails_controller_test.rb",
    package: "actionmailbox",
    reason: "CONVERGEABLE actionmailbox-mailgun-ingress",
  },
  {
    pattern: "ingresses/mandrill/inbound_emails_controller.rb",
    testFile: "controllers/ingresses/mandrill/inbound_emails_controller_test.rb",
    package: "actionmailbox",
    reason: "CONVERGEABLE actionmailbox-mandrill-ingress",
  },
  {
    pattern: "ingresses/postmark/inbound_emails_controller.rb",
    testFile: "controllers/ingresses/postmark/inbound_emails_controller_test.rb",
    package: "actionmailbox",
    reason: "CONVERGEABLE actionmailbox-postmark-ingress",
  },
  {
    pattern: "ingresses/sendgrid/inbound_emails_controller.rb",
    testFile: "controllers/ingresses/sendgrid/inbound_emails_controller_test.rb",
    package: "actionmailbox",
    reason: "CONVERGEABLE actionmailbox-sendgrid-ingress",
  },
];
