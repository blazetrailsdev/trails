import type { ChannelGenerator } from "./channel-generator.js";

type Template = (this: ChannelGenerator, ext: string) => string;

const applicationCableChannel = function (): string {
  return `import { ActionCable } from "@blazetrails/actioncable";

export class Channel extends ActionCable.Channel.Base {
}
`;
};

const applicationCableConnection = function (): string {
  return `import { ActionCable } from "@blazetrails/actioncable";

export class Connection extends ActionCable.Connection.Base {
}
`;
};

/** @missingRailsCall module_namespacing — CONVERGEABLE scaffold-controller-hooks-test-framework-and-engine-arms */
const channel: Template = function (ext) {
  const root = "../".repeat(this.classPathParts.length);
  const actions = this.actions.map((action) => `\n  ${action}(): void {\n  }\n`).join("");
  return `import * as ApplicationCable from "${root || "./"}application-cable/channel${ext}";

export class ${this.className().split("::").pop()}Channel extends ApplicationCable.Channel {
  subscribed(): void {
    // this.streamFrom("some_channel");
  }

  unsubscribed(): void {
    // Any cleanup needed when channel is unsubscribed
  }
${actions}}
`;
};

const javascriptChannel: Template = function () {
  const actions = this.actions;
  return `import consumer from "./consumer"

consumer.subscriptions.create("${this.className()}Channel", {
  connected() {
    // Called when the subscription is ready for use on the server
  },

  disconnected() {
    // Called when the subscription has been terminated by the server
  },

  received(data) {
    // Called when there's incoming data on the websocket for this channel
  }${actions.length > 0 ? ",\n" : ""}
${actions
  .map(
    (action) => `  ${action}: function() {
    return this.perform('${action}');
  }${action === actions.at(-1) ? "" : ",\n"}
`,
  )
  .join("")}});
`;
};

const javascriptConsumer = function (): string {
  return `// Action Cable provides the framework to deal with WebSockets in Rails.
// You can generate new channels where WebSocket features live using the \`bin/trails generate channel\` command.

import { createConsumer } from "@rails/actioncable"

export default createConsumer()
`;
};

const javascriptIndex = function (): string {
  return `// Import all the channels to be used by Action Cable
`;
};

export const TEMPLATES = {
  "application_cable/channel.rb": applicationCableChannel,
  "application_cable/connection.rb": applicationCableConnection,
  "channel.rb": channel,
  "javascript/channel.js": javascriptChannel,
  "javascript/consumer.js": javascriptConsumer,
  "javascript/index.js": javascriptIndex,
};
