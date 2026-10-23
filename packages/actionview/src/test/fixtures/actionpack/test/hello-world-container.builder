xml.test(async () => {
  await render({ partial: "hello", locals: { xm: xml } });
});
