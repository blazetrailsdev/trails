import { StandardError } from "@blazetrails/ruby-compat";

const TROUBLESHOOTING = `Visit the Troubleshooting guide for more information:
  https://vite-ruby.netlify.app/guide/troubleshooting.html#troubleshooting
`;

export class Error extends StandardError {
  constructor(message?: string) {
    super(message?.replace(":troubleshooting:", TROUBLESHOOTING));
  }
}
