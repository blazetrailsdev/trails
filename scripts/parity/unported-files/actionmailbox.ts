import type { UnportedFile } from "./types.js";

export const ACTIONMAILBOX_UNPORTED_FILES: UnportedFile[] = [
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
