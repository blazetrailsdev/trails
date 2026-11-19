import { Company } from "../../models/company.js";
import { Admin, BaseController } from "./base-controller.js";

export class CompaniesController extends BaseController {
  declare company: Company;

  show(): void {
    this.company = new Company({ id: 1, name: "Basecamp" });
  }
}
Admin.CompaniesController = CompaniesController;
