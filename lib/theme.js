export const THEME_KEY = "specimen-theme";

// Inlined in <head> so it runs before first paint. Without it the light
// palette renders first and the theme arrives as a visible flash. Falls back
// to the OS preference until the toggle has been used once.
export const themeBootScript = `(function(){try{var k=${JSON.stringify(THEME_KEY)};var t=localStorage.getItem(k);if(t!=="dark"&&t!=="light"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;
