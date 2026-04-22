export type Locale = "pt-BR" | "en";

export const i18nStore = $state({
  locale: "pt-BR" as Locale,

  init() {
    const saved = localStorage.getItem("myterm_lang");
    if (saved === "en" || saved === "pt-BR") {
      this.locale = saved;
    } else {
      const lang = navigator.language;
      if (lang.startsWith("en")) {
        this.locale = "en";
      } else {
        this.locale = "pt-BR";
      }
    }
  },

  setLocale(l: Locale) {
    this.locale = l;
    localStorage.setItem("myterm_lang", l);
  }
});
