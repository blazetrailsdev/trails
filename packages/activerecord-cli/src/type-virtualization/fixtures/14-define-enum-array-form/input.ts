export class Conversation extends Base {
  static {
    this.attribute("status", "integer");
  }
}

Conversation.enum("status", ["active", "archived"]);
