import { Topic } from "./topic.js";

export class Reply extends Topic {
  static {
    this.validate(":errorsOnEmptyContent");
    this.validate(":titleIsWrongCreate", { on: "create" });

    this.validate(":checkEmptyTitle");
    this.validate(":checkContentMismatch", { on: "create" });
    this.validate(":checkWrongUpdate", { on: "update" });
  }

  checkEmptyTitle(): void {
    if (!(this.title != null && this.title.length > 0)) this.errors.add("title", "is Empty");
  }

  errorsOnEmptyContent(): void {
    if (!(this.content != null && this.content.length > 0)) this.errors.add("content", "is Empty");
  }

  checkContentMismatch(): void {
    if (this.title != null && this.content != null && this.content === "Mismatch") {
      this.errors.add("title", "is Content Mismatch");
    }
  }

  titleIsWrongCreate(): void {
    if (this.title != null && this.title === "Wrong Create")
      this.errors.add("title", "is Wrong Create");
  }

  checkWrongUpdate(): void {
    if (this.title != null && this.title === "Wrong Update")
      this.errors.add("title", "is Wrong Update");
  }
}
