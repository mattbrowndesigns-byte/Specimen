// A readable name for a hex value.
//
// Generated rather than looked up. A table of the 148 CSS colour names sounds
// like the answer until you use it: a page's off-white lands on "Linen" or
// "Old Lace", which tells a designer nothing about how light or how warm it
// is. Describing the colour instead -- lightness, then how much colour is in
// it, then which -- produces "Warm off-white" and "Deep green", which is what
// someone would actually say out loud.

// Thirteen steps, because twelve leaves lime and yellow sharing a name and
// those are the two a brand is most likely to have picked on purpose.
const HUES = [
  [12, "red"],
  [36, "orange"],
  [50, "amber"],
  [64, "yellow"],
  [78, "lime"],
  [150, "green"],
  [180, "teal"],
  [200, "cyan"],
  [240, "blue"],
  [270, "indigo"],
  [290, "violet"],
  [330, "magenta"],
  [360, "red"],
];

// Below this there isn't enough colour to name one, so it's a neutral -- but
// above the warm/cool floor there's still enough to say which way it leans,
// which is the difference between "off-white" and "warm off-white".
const NEUTRAL_CHROMA = 0.09;
const TINT_CHROMA = 0.015;

function toRgb(hex) {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hueOf(r, g, b, max, delta) {
  if (delta === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const hueName = (h) => HUES.find(([limit]) => h < limit)?.[1] || "red";

export function colorName(hex) {
  if (typeof hex !== "string" || !/^#[0-9a-f]{3,8}$/i.test(hex)) return "Colour";

  const [r, g, b] = toRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = (max - min) / 255;
  const light = (max + min) / 2 / 255;
  const hue = hueOf(r, g, b, max, max - min);

  if (chroma < NEUTRAL_CHROMA) {
    const base =
      light > 0.97 ? "White"
      : light > 0.9 ? "Off-white"
      : light > 0.72 ? "Light grey"
      : light > 0.45 ? "Grey"
      : light > 0.25 ? "Dark grey"
      : light > 0.07 ? "Charcoal"
      : "Black";

    // A near-black or near-white with a measurable cast is a deliberate choice
    // in a palette, and calling it plain "black" loses the thing that was
    // decided. Warm and cool is how it gets talked about.
    if (chroma > TINT_CHROMA && base !== "White" && base !== "Black") {
      const warm = hue < 90 || hue > 300;
      return `${warm ? "Warm" : "Cool"} ${base.toLowerCase()}`;
    }
    return base;
  }

  let name = hueName(hue);

  // Two names worth having, because they're what a designer says rather than
  // what the maths produces: a dark, muted orange is brown, and a dark blue is
  // navy. Left as the literal description, Mollie's #211006 reads "dark muted
  // orange" when everyone looking at it would call it dark brown.
  const qualifierLight = (max + min) / 2 / 255;
  if ((name === "orange" || name === "amber") && qualifierLight < 0.38) name = "brown";
  if (name === "blue" && qualifierLight < 0.26) name = "navy";

  const qualifier =
    light > 0.85 ? "Pale"
    : light > 0.68 ? "Light"
    : light > 0.4 ? ""
    : light > 0.2 ? "Deep"
    : "Dark";
  const muted = chroma < 0.28 ? "Muted" : "";

  // "brown" and "navy" already carry the darkness, so the qualifier would be
  // saying it twice.
  const carriesDarkness = name === "brown" || name === "navy";
  const words = [carriesDarkness ? "" : qualifier, muted, name].filter(Boolean);
  const label = words.join(" ").toLowerCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}
