import { ApplicationController } from "./application-controller.js";
import { Dog } from "../models/dog.js";

export class DogsController extends ApplicationController {
  async create(): Promise<void> {
    const dog = new Dog(this.params.expect({ dog: ["name"] }));
    await dog.save();
    await this.render({ json: { name: dog.readAttribute("name") }, status: ":created" });
  }
}
