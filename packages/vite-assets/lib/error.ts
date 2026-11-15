import { StandardError } from "@blazetrails/ruby-compat";

const TROUBLESHOOTING = `Visit the Troubleshooting guide for more information:
  https://vite-ruby.netlify.app/guide/troubleshooting.html#troubleshooting
`;

export class Error extends StandardError {
  #message: string;

  constructor(message?: string) {
    super(message);
    this.#message = message ?? new.target.name;
    delete (this as { message?: string }).message;
  }

  override get message(): string {
    return this.#message.replace(":troubleshooting:", TROUBLESHOOTING);
  }
}
