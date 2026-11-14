import { Mail } from "./mail.js";
import "./network/retriever-methods/base.js";

Mail.registerAutoload("SMTP", "./network/delivery-methods/smtp.js");
Mail.registerAutoload("FileDelivery", "./network/delivery-methods/file-delivery.js");
Mail.registerAutoload("LoggerDelivery", "./network/delivery-methods/logger-delivery.js");
Mail.registerAutoload("Sendmail", "./network/delivery-methods/sendmail.js");
Mail.registerAutoload("Exim", "./network/delivery-methods/exim.js");
Mail.registerAutoload("SMTPConnection", "./network/delivery-methods/smtp-connection.js");
Mail.registerAutoload("TestMailer", "./network/delivery-methods/test-mailer.js");

Mail.registerAutoload("POP3", "./network/retriever-methods/pop3.js");
Mail.registerAutoload("IMAP", "./network/retriever-methods/imap.js");
Mail.registerAutoload("TestRetriever", "./network/retriever-methods/test-retriever.js");
