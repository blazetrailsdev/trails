import type { SafeBuffer } from "@blazetrails/activesupport";
import { safeJoin } from "@blazetrails/actionview";
import type { ViewHost } from "../../lib/trails-ext/view-host.ts";

export const TranslationsHelper = {
  TRANSLATIONS: {
    bookAuthor: {
      "🇺🇸": "Author",
      "🇪🇸": "Autor",
      "🇫🇷": "Auteur",
      "🇮🇳": "लेखक",
      "🇩🇪": "Autor",
      "🇧🇷": "Autor",
    },
    bookSubtitle: {
      "🇺🇸": "Subtitle",
      "🇪🇸": "Subtítulo",
      "🇫🇷": "Sous-titre",
      "🇮🇳": "उपशीर्षक",
      "🇩🇪": "Untertitel",
      "🇧🇷": "Subtítulo",
    },
    bookTitle: {
      "🇺🇸": "Book title",
      "🇪🇸": "Título del libro",
      "🇫🇷": "Titre du livre",
      "🇮🇳": "पुस्तक का शीर्षक",
      "🇩🇪": "Buchtitel",
      "🇧🇷": "Título do livro",
    },
    customStyles: {
      "🇺🇸": "Add custom CSS styles. Use Caution: you could break things.",
      "🇪🇸": "Agrega estilos CSS personalizados. Usa precaución: podrías romper cosas.",
      "🇫🇷": "Ajoutez des styles CSS personnalisés. Utilisez avec précaution : vous pourriez casser des choses.",
      "🇮🇳": "कस्टम CSS स्टाइल जोड़ें। सावधानी बरतें: आप चीज़ों को तोड़ सकते हैं।",
      "🇩🇪": "Fügen Sie benutzerdefinierte CSS-Stile hinzu. Vorsicht: Sie könnten Dinge kaputt machen.",
      "🇧🇷": "Adicione estilos CSS personalizados. Use com cuidado: você pode quebrar coisas.",
    },
    emailAddress: {
      "🇺🇸": "Enter your email address",
      "🇪🇸": "Introduce tu correo electrónico",
      "🇫🇷": "Entrez votre adresse courriel",
      "🇮🇳": "अपना ईमेल पता दर्ज करें",
      "🇩🇪": "Geben Sie Ihre E-Mail-Adresse ein",
      "🇧🇷": "Insira seu endereço de email",
    },
    password: {
      "🇺🇸": "Enter your password",
      "🇪🇸": "Introduce tu contraseña",
      "🇫🇷": "Saisissez votre mot de passe",
      "🇮🇳": "अपना पासवर्ड दर्ज करें",
      "🇩🇪": "Geben Sie Ihr Passwort ein",
      "🇧🇷": "Insira sua senha",
    },
    pictureCaption: {
      "🇺🇸": "Picture caption",
      "🇪🇸": "Subtítulo de la imagen",
      "🇫🇷": "Légende de l'image",
      "🇮🇳": "चित्र का कैप्शन",
      "🇩🇪": "Bildunterschrift",
      "🇧🇷": "Legenda da imagem",
    },
    transferSession: {
      "🇺🇸": "Share to get them back into their account",
      "🇪🇸": "Comparte para que vuelvan a acceder a su cuenta",
      "🇫🇷": "Partagez pour les reconnecter à leur compte",
      "🇮🇳": "उन्हें उनके खाते में वापस लाने के लिए साझा करें",
      "🇩🇪": "Teilen, um ihnen den Zugang zu ihrem Konto zu ermöglichen",
      "🇧🇷": "Compartilhe para que eles voltem a acessar sua conta",
    },
    transferSessionSelf: {
      "🇺🇸": "Link to automatically log in on another device",
      "🇪🇸": "Enlace para iniciar sesión automáticamente en otro dispositivo",
      "🇫🇷": "Lien pour se connecter automatiquement sur un autre appareil",
      "🇮🇳": "किसी अन्य डिवाइस पर स्वचालित रूप से लॉग इन करने के लिए लिंक",
      "🇩🇪": "Link, um sich automatisch auf einem anderen Gerät anzumelden",
      "🇧🇷": "Link para fazer login automaticamente em outro dispositivo",
    },
    userName: {
      "🇺🇸": "Enter your name",
      "🇪🇸": "Introduce tu nombre",
      "🇫🇷": "Entrez votre nom",
      "🇮🇳": "अपना नाम दर्ज करें",
      "🇩🇪": "Geben Sie Ihren Namen ein",
      "🇧🇷": "Insira seu nome",
    },
    updatePassword: {
      "🇺🇸": "Change password",
      "🇪🇸": "Cambiar contraseña",
      "🇫🇷": "Changer le mot de passe",
      "🇮🇳": "पासवर्ड बदलें",
      "🇩🇪": "Passwort ändern",
      "🇧🇷": "Alterar senha",
    },
  } as Record<string, Record<string, string>>,

  translationsFor(this: ViewHost, translationKey: string): SafeBuffer {
    return this.tag().dl({ class: "language-list" }, () =>
      safeJoin(
        Object.entries(TranslationsHelper.TRANSLATIONS[translationKey]).flatMap(
          ([language, translation]) => [
            this.tag().dt(language),
            this.tag().dd(translation, { class: "margin-none" }),
          ],
        ),
      ),
    );
  },

  translationButton(this: ViewHost, translationKey: string): SafeBuffer {
    return this.tag().div(
      {
        class: "position-relative",
        data: {
          controller: "popover",
          action: "keydown.esc->popover#close click@document->popover#closeOnClickOutside",
          popoverOrientationTopClass: "popover-orientation-top",
        },
      },
      () =>
        safeJoin([
          this.tag().button(
            { type: "button", class: "btn", tabindex: -1, data: { action: "popover#toggle" } },
            () =>
              safeJoin([
                this.imageTag("globe.svg", { size: 20, role: "presentation", class: "color-icon" }),
                this.tag().span("Translate", { class: "for-screen-reader" }),
              ]),
          ),
          this.tag().dialog(
            { class: "lanuage-list-menu popover shadow", data: { popoverTarget: "menu" } },
            () => (this.translationsFor as (k: string) => SafeBuffer)(translationKey),
          ),
        ]),
    );
  },
};
