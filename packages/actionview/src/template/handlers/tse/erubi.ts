import { compileJs } from "@blazetrails/tse-compiler";

export class Erubi {
  readonly bufvar: string;
  readonly src: string;

  constructor(input: string, properties: { bufvar?: string; preamble?: string } = {}) {
    properties = { ...properties };

    properties.bufvar ||= "context.outputBuffer";
    properties.preamble ||= "";

    this.bufvar = properties.bufvar;
    this.src = compileJs(input, properties).code;
  }
}
