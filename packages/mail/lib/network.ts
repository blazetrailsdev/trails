import { Mail } from "./mail.js";
import "./network/retriever-methods/base.js";

Mail.registerAutoload("SMTP", "network/delivery-methods/smtp");
Mail.registerAutoload("FileDelivery", "network/delivery-methods/file-delivery");
Mail.registerAutoload("LoggerDelivery", "network/delivery-methods/logger-delivery");
Mail.registerAutoload("Sendmail", "network/delivery-methods/sendmail");
Mail.registerAutoload("Exim", "network/delivery-methods/exim");
Mail.registerAutoload("SMTPConnection", "network/delivery-methods/smtp-connection");
Mail.registerAutoload("TestMailer", "network/delivery-methods/test-mailer");

Mail.registerAutoload("POP3", "network/retriever-methods/pop3");
Mail.registerAutoload("IMAP", "network/retriever-methods/imap");
Mail.registerAutoload("TestRetriever", "network/retriever-methods/test-retriever");
