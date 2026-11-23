// `mail` reaches nodemailer's SMTP client at module scope; a browser has no
// sockets to send mail over, so the bundle gets a class that refuses.
export default class SMTPConnection {
  constructor() {
    throw new Error("SMTP is not available in the browser");
  }
}
