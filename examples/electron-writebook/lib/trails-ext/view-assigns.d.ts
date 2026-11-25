// Instance variables Writebook's templates set for the layout to read
// (`@layout_class` in app/views/**/*.html.erb).
declare module "@blazetrails/actionview" {
  interface Base {
    layoutClass?: string;
  }
}

export {};
