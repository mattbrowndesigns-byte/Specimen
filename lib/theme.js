export const THEME_KEY = "specimen-theme";

// Inlined in <head> so it runs before first paint. Without it the light
// palette renders first and the theme arrives as a visible flash. Falls back
// to the OS preference until the toggle has been used once -- except in the
// demo, which opens dark: it is the theme the reel and the portfolio show,
// and a stranger's first look should match them. The `kivli_demo` flag cookie
// is the browser-readable half of the demo pass. The toggle still wins once
// used, since that is stored.
export const themeBootScript = `(function(){try{var k=${JSON.stringify(THEME_KEY)};var t=localStorage.getItem(k);if(t!=="dark"&&t!=="light"){t=/(^|; )kivli_demo=1(;|$)/.test(document.cookie)?"dark":window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="light";}})();`;
