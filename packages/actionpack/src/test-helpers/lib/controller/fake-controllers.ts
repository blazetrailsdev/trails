import { registerConstant, underscore } from "@blazetrails/activesupport";
import { Base } from "../../../action-controller/base.js";
import { controllerConstants } from "../../../action-dispatch/http/request.js";
import type { DispatchableControllerClass } from "../../../action-dispatch/routing/dispatcher.js";

export class ContentController extends Base {}

export const Admin: Record<string, typeof Base> = {
  AccountsController: class AccountsController extends Base {},
  PostsController: class PostsController extends Base {},
  StuffController: class StuffController extends Base {},
  UserController: class UserController extends Base {},
  UsersController: class UsersController extends Base {},
};

export const Api: Record<string, typeof Base> = {
  UsersController: class UsersController extends Base {},
  ProductsController: class ProductsController extends Base {},
};

export class AccountController extends Base {}
export class ArchiveController extends Base {}
export class ArticlesController extends Base {}
export class BarController extends Base {}
export class BlogController extends Base {}
export class BooksController extends Base {}
export class CarsController extends Base {}
export class CcController extends Base {}
export class CController extends Base {}
export class FooController extends Base {}
export class GeocodeController extends Base {}
export class NewsController extends Base {}
export class NotesController extends Base {}
export class PagesController extends Base {}
export class PeopleController extends Base {}
export class PostsController extends Base {}
export class SubpathBooksController extends Base {}
export class SymbolsController extends Base {}
export class UserController extends Base {}
export class UsersController extends Base {}

for (const [mod, constants] of Object.entries({ Admin, Api })) {
  registerConstant(mod, constants);
  for (const [name, klass] of Object.entries(constants)) {
    Object.defineProperty(klass, "name", { value: `${mod}::${name}` });
  }
}

for (const klass of [
  ContentController,
  ...Object.values(Admin),
  ...Object.values(Api),
  AccountController,
  ArchiveController,
  ArticlesController,
  BarController,
  BlogController,
  BooksController,
  CarsController,
  CcController,
  CController,
  FooController,
  GeocodeController,
  NewsController,
  NotesController,
  PagesController,
  PeopleController,
  PostsController,
  SubpathBooksController,
  SymbolsController,
  UserController,
  UsersController,
]) {
  registerConstant(klass.name, klass);
  controllerConstants.set(
    underscore(klass.name.replace(/Controller$/, "")),
    klass as unknown as DispatchableControllerClass,
  );
}
