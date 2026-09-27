export const TEMPLATES: Record<string, string> = {
  "app/views/passwords/new.html.erb": `<h1>Forgot your password?</h1>

<%= flash.get("alert") != null ? tag.div(flash.get("alert"), { style: "color:red" }) : null %>

<%= formWith({ url: passwordsPath() }, (form) => { %>
  <%= form.emailField("email_address", { required: true, autofocus: true, autocomplete: "username", placeholder: "Enter your email address", value: params.get("email_address") }) %><br>
  <%= form.submit("Email reset instructions") %>
<% }) %>
`,

  "app/views/passwords/edit.html.erb": `<h1>Update your password</h1>

<%= flash.get("alert") != null ? tag.div(flash.get("alert"), { style: "color:red" }) : null %>

<%= formWith({ url: passwordPath(params.get("token")), method: "put" }, (form) => { %>
  <%= form.passwordField("password", { required: true, autocomplete: "new-password", placeholder: "Enter new password", maxlength: 72 }) %><br>
  <%= form.passwordField("password_confirmation", { required: true, autocomplete: "new-password", placeholder: "Repeat new password", maxlength: 72 }) %><br>
  <%= form.submit("Save") %>
<% }) %>
`,

  "app/views/sessions/new.html.erb": `<%= flash.get("alert") != null ? tag.div(flash.get("alert"), { style: "color:red" }) : null %>
<%= flash.get("notice") != null ? tag.div(flash.get("notice"), { style: "color:green" }) : null %>

<%= formWith({ url: sessionPath() }, (form) => { %>
  <%= form.emailField("email_address", { required: true, autofocus: true, autocomplete: "username", placeholder: "Enter your email address", value: params.get("email_address") }) %><br>
  <%= form.passwordField("password", { required: true, autocomplete: "current-password", placeholder: "Enter your password", maxlength: 72 }) %><br>
  <%= form.submit("Sign in") %>
<% }) %>
<br>

<%= linkTo("Forgot password?", newPasswordPath()) %>
`,
};
