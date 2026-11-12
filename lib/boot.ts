// Keys used in the browser storage, and a tiny script that runs before the page paints,
// so the right language, direction and day/night mode show at once (no flash of the wrong theme).

export const LOCALE_KEY = "nahrain.locale";
export const THEME_KEY = "nahrain.theme";
export const TEXT_SIZE_KEY = "nahrain.textsize";

export const bootScript = `(function(){try{
var l=localStorage.getItem("${LOCALE_KEY}");if(l!=="en")l="ar";
var d=document.documentElement;d.lang=l;d.dir=l==="ar"?"rtl":"ltr";
var t=localStorage.getItem("${THEME_KEY}");
if(t==="dark"||(t===null&&window.matchMedia("(prefers-color-scheme: dark)").matches))d.classList.add("dark");
var z=localStorage.getItem("${TEXT_SIZE_KEY}");if(z==="large")d.style.fontSize="112.5%";else if(z==="xl")d.style.fontSize="125%";
}catch(e){}})();`;

/** Read the language outside React (used by the fake backend for its messages). */
export function currentLocale(): "ar" | "en" {
  try {
    return localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}
