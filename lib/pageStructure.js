import * as cheerio from "cheerio";

// What the markup knows that a screenshot cannot show.
//
// A picture of a carousel and a picture of a static row are the same picture.
// The arrows might be hidden until hover, the pagination might be three faint
// dashes, and the capture freezes animation on purpose -- so a hero that
// cycles looks exactly like a hero that doesn't. The markup is not coy about
// it: 829studios.com carries `aria-roledescription="carousel"`, a Swiper
// bundle, and a div called `hero-slider-slide`.
//
// This is *evidence*, never an answer. It is handed to the model beside the
// pictures and the model decides, because the quality of it varies enormously
// with how a site was built:
//
//   829studios.com  hero-display > hero-slider-slide > text-lead >
//                   logo-carousel > related-case-study > tab-graphic
//   stripe.com      nothing
//   attio.com       nothing
//
// WordPress and ACF name their blocks in class attributes and hand you the
// page's outline for free; anything built with hashed CSS class names gives up
// nothing at all. So this never replaces looking, it only ever adds to it, and
// every failure returns null rather than throwing.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const TIMEOUT_MS = 8000;

// Enough of a page to carry its structure without carrying a megabyte of it
// into a prompt.
const MAX_BLOCKS = 24;
const MAX_HEADINGS = 16;

const CAROUSEL_LIBS = ["swiper", "slick", "splide", "glide", "embla", "flickity", "owl-carousel", "keen-slider"];

// Classes a site gives its own sections. The prefixes are the conventions that
// actually appear in the wild: WordPress core, ACF, and the BEM-ish `c-`/`o-`
// most hand-rolled systems land on.
const BLOCK_CLASS = /^(?:wp-block-|block-|acf-block--|section--|c-|o-)([a-z0-9-]{3,40})$/i;

// Names that describe the furniture rather than a block worth recording.
//
// The substring test matters more than it looks. Matching only whole names let
// ten `navigation-link`, `navigation-submenu`, `navigation-columns` variants
// through, and since they appear first in the document they filled the list
// and pushed `hero-slider-slide`, `logo-carousel` and `tab-graphic` -- the
// three names that would have answered the question -- off the end of it.
const SKIP_PART = /(navigation|breadcrumb|menu|is-layout|wrapper|container)/i;
const SKIP_WHOLE = /^(nav|header|footer|button|buttons|paragraph|heading|image|link|list|group|col|cols|column|columns|row|inner|content|spacer|separator|white|black|logo|starts-with-text)$/i;

export async function readPageStructure(url) {
  let html;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!res.ok) return null;
    html = await res.text();
  } catch {
    // A site that won't answer is a site we tag from the pictures alone.
    return null;
  }

  try {
    const $ = cheerio.load(html);
    const lower = html.toLowerCase();

    const blocks = [];
    $("[class]").each((_, el) => {
      for (const cls of ($(el).attr("class") || "").split(/\s+/)) {
        const match = cls.match(BLOCK_CLASS);
        if (!match) continue;
        const name = match[1].split("__")[0].replace(/--.*$/, "");
        if (SKIP_PART.test(name) || SKIP_WHOLE.test(name) || blocks.includes(name)) continue;
        // `tab-graphic-tab` after `tab-graphic`, `text-row-item` after
        // `text-row`: the parts a block is made of, not another block.
        if (blocks.some((kept) => name.startsWith(`${kept}-`))) continue;
        if (blocks.length < MAX_BLOCKS) blocks.push(name);
      }
    });

    const headings = [];
    $("section, header, footer, main > div, article").each((_, el) => {
      const text = $(el).find("h1,h2,h3").first().text().trim().replace(/\s+/g, " ");
      if (text && text.length <= 80 && !headings.includes(text) && headings.length < MAX_HEADINGS) {
        headings.push(text);
      }
    });

    const structure = {
      blocks,
      headings,
      carouselLibraries: CAROUSEL_LIBS.filter((lib) => lower.includes(lib)),
      carouselRoles: $('[aria-roledescription="carousel"]').length,
      tablists: $('[role="tablist"]').length,
      expandable: $("[aria-expanded]").length + $("details").length,
      forms: $("form").length,
      tables: $("table").length,
      videos: $("video").length + (lower.includes("youtube.com/embed") || lower.includes("player.vimeo") ? 1 : 0),
    };

    // Nothing worth a paragraph of prompt.
    const empty =
      !structure.blocks.length &&
      !structure.headings.length &&
      !structure.carouselLibraries.length &&
      !structure.carouselRoles &&
      !structure.tablists;
    return empty ? null : structure;
  } catch {
    return null;
  }
}

// Rendered for the prompt. Deliberately terse, and deliberately hedged: the
// model is told this is a hint from the markup, not a finding, because a class
// called `hero-slider-slide` on a site that stopped using its slider is a lie
// the pictures will catch.
export function describeStructure(structure) {
  if (!structure) return "";
  const lines = [];
  if (structure.blocks.length) {
    lines.push(`Sections the markup names, in page order: ${structure.blocks.join(", ")}.`);
  }
  if (structure.headings.length) {
    lines.push(`Section headings, in page order: ${structure.headings.map((h) => `"${h}"`).join(", ")}.`);
  }

  // Pulled out and stated as a fact rather than left in the list. A site that
  // calls its own div `logo-carousel` has told you what that block is, in its
  // own words, and no screenshot can argue -- the capture freezes animation on
  // purpose, so a carousel mid-slide and a static row are the same picture.
  // Left as one hint among twenty, this got ignored twice in testing.
  const MOTION = /(slider|slide|carousel|swiper|marquee|ticker|slick|splide)/i;
  const moves = structure.blocks.filter((b) => MOTION.test(b));
  if (moves.length) {
    lines.push(
      `The markup calls these blocks sliders or carousels, in the site's own words: ${moves.join(", ")}. Tag each as the Carousel variety of its family. The screenshot cannot contradict this, because the capture freezes animation.`
    );
  }

  const moving = [];
  if (structure.carouselRoles) moving.push(`${structure.carouselRoles} element(s) marked up as a carousel`);
  if (structure.carouselLibraries.length) moving.push(`a ${structure.carouselLibraries.join("/")} slider is loaded`);
  if (moving.length) {
    lines.push(`Movement: ${moving.join(", ")} -- so something on this page cycles even though the screenshot is frozen.`);
  }
  if (structure.tablists) lines.push(`${structure.tablists} tab set(s) in the markup.`);
  if (structure.expandable) lines.push(`${structure.expandable} expandable element(s), which usually means an accordion or FAQ.`);
  if (structure.forms) lines.push(`${structure.forms} form(s).`);
  if (structure.tables) lines.push(`${structure.tables} table(s).`);
  if (structure.videos) lines.push(`Video on the page.`);

  return lines.length
    ? `\n\nEVIDENCE FROM THE PAGE'S CODE, read out of the HTML. Use it to settle what a frozen screenshot cannot show, above all whether a block cycles. On layout and appearance the pictures win. On movement the code wins, every time: the capture has animation switched off, so nothing in the image can tell you a carousel from a still row.\n${lines.map((l) => `   - ${l}`).join("\n")}`
    : "";
}
