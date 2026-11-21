import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { captureSection, thumbnail, wholeImage } from "@/lib/mcp/images";
import {
  KIND_LABELS,
  findCollectionId,
  findSimilar,
  listCollections,
  listTags,
  loadOne,
  searchLibrary,
} from "@/lib/mcp/library";
import { itemLine, latestCaptureOf, plural } from "@/lib/mcp/format";
import { loadCollection, loadVisual } from "@/lib/exportData";
import {
  collectionMarkdown,
  componentMarkdown,
  resourceMarkdown,
  siteMarkdown,
  visualMarkdown,
} from "@/lib/exportMarkdown";

// Kivli as an MCP server: a designer's own library, readable from whichever
// AI they work in.
//
// Read-only on purpose, and for now. Reading is the whole of what was asked
// ("search my library", "find me something like this"), it is the half that
// cannot go wrong in a way anybody notices late, and every tool here is a
// rendering of something the app already shows -- the Markdown is the same
// renderer Copy for AI uses, so a save reads the same pasted or fetched.
//
// What text could never carry is the point of the images. A tool that
// describes a screenshot in words to a model that can see is a tool doing the
// worst version of its job, so a site comes back with the top of its page
// attached and the rest of it a call away.

const instructions = (demo) => `This is ${demo ? "the demo copy of " : ""}a designer's personal inspiration library in Kivli: websites (each with full-page screenshots, a measured colour palette and identified typefaces), components (cropped UI patterns), resources (tools and references saved for what they do)${demo ? "" : ", visuals (images from agency case studies)"} and hand-made collections.

How far to trust each part: colours and type roles were measured from the live page; tags and summaries were written by AI and may be imperfect; notes are the owner's own words and carry the most weight.

Start with search_library or list_collections. get_item returns everything about one save plus the top of its screenshot; get_screenshot scrolls further down a page. find_similar ranks the library against one save. Tag names come from the owner's own vocabulary (list_tags).`;

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const text = (value) => ({ type: "text", text: value });

function failure(err) {
  console.error("MCP tool failed:", err);
  return { isError: true, content: [text(err?.message || "Something went wrong reading the library.")] };
}

// `owner` is { id, demo }. `origin` is where links back into the app point.
export function buildServer({ owner, origin }) {
  const server = new McpServer(
    { name: "kivli", title: "Kivli", version: "1.0.0", websiteUrl: origin },
    { instructions: instructions(owner.demo) }
  );
  const supabase = supabaseAdmin();
  // The demo account's notes were stripped when it was seeded; treating it as
  // a share as well means no future seed can put one in front of a stranger.
  const shared = Boolean(owner.demo);
  // Visuals are not in the demo, the same rule as the app's own menu.
  const kinds = owner.demo ? ["site", "component", "resource"] : ["site", "component", "resource", "visual"];
  const KindEnum = z.enum(kinds);
  const exportedAt = () => new Date().toISOString();
  const link = (kind, id) => `${origin}/${kind === "site" ? "sites" : `${kind}s`}/${id}`;

  server.registerTool(
    "search_library",
    {
      title: "Search the library",
      description:
        "Search the designer's saved websites, components, resources and visuals by words and/or tags. With no query, lists the most recent saves. Returns ids to use with get_item and find_similar.",
      inputSchema: {
        query: z.string().optional().describe("Words to look for in names, summaries, notes, URLs and tag labels."),
        kind: z
          .enum(["all", ...kinds])
          .optional()
          .describe("Limit to one kind of save. Defaults to all."),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tag labels every result must carry, exactly as in list_tags (e.g. 'Hero Carousel', 'Brutalist')."),
        limit: z.number().int().min(1).max(30).optional().describe("Most results per kind. Defaults to 10."),
      },
      annotations: { title: "Search the library", ...READ_ONLY },
    },
    async ({ query, kind = "all", tags, limit = 10 }) => {
      try {
        const wanted = kind === "all" ? kinds : [kind];
        const { missing, results } = await searchLibrary(supabase, owner.id, { query, kinds: wanted, tags, limit, shared });
        if (missing.length) {
          return {
            content: [
              text(
                `There is no tag called ${missing.map((m) => `"${m}"`).join(", ")} in this library, so nothing carries it. list_tags shows the words that exist.`
              ),
            ],
          };
        }
        const found = results.filter((r) => r.total);
        const words = query?.trim() ? `"${query.trim()}"` : "";
        const tagged = tags?.length ? tags.join(" and ") : "";
        const what = [words, tagged && `tagged ${tagged}`].filter(Boolean).join(", ");
        if (!found.length) {
          const none = words && tagged
            ? `Nothing matching ${words} is tagged ${tagged}.`
            : tagged
              ? `Nothing in the library is tagged ${tagged}.`
              : `Nothing in the library matches ${words || "that"}.`;
          return { content: [text(none)] };
        }

        const out = [
          query || tags?.length
            ? `Matches for ${what}: ${found.map((r) => plural(r.total, KIND_LABELS[r.kind].toLowerCase())).join(", ")}.`
            : `Most recent saves.`,
        ];
        for (const r of found) {
          out.push("", `## ${KIND_LABELS[r.kind]}s${r.total > r.rows.length ? ` (first ${r.rows.length} of ${r.total})` : ""}`);
          for (const row of r.rows) out.push(itemLine(r.kind, row, link(r.kind, row.id)));
        }
        return { content: [text(out.join("\n"))] };
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "get_item",
    {
      title: "Open a save",
      description:
        "Everything the library knows about one save: summary, tags, the owner's notes, and for a website its measured colours, typefaces, key pages and the top of its desktop screenshot. Use get_screenshot to see further down the page.",
      inputSchema: {
        kind: KindEnum.describe("The kind of save, as returned by search_library."),
        id: z.string().describe("The save's id."),
        screenshot: z.boolean().optional().describe("Attach the image. Defaults to true."),
      },
      annotations: { title: "Open a save", ...READ_ONLY },
    },
    async ({ kind, id, screenshot = true }) => {
      try {
        const opts = { exportedAt: exportedAt(), shared, sourceUrl: link(kind, id) };
        if (kind === "visual") {
          const visual = await loadVisual(supabase, owner.id, id);
          if (!visual) return { isError: true, content: [text("No visual with that id in this library.")] };
          const content = [text(`kind: visual · id: ${id}\n\n${visualMarkdown(visual, opts)}`)];
          if (screenshot && visual.image_url) content.push(...(await images([() => wholeImage(visual.image_url)])));
          return { content };
        }

        const item = await loadOne(supabase, owner.id, kind, id, { shared });
        if (!item) return { isError: true, content: [text(`No ${kind} with that id in this library.`)] };
        const head = `kind: ${kind} · id: ${id}\n\n`;

        if (kind === "resource") return { content: [text(head + resourceMarkdown(item, opts))] };
        if (kind === "component") {
          const content = [text(head + componentMarkdown(item, { ...opts, imagesAttached: screenshot }))];
          if (screenshot && item.image_url) content.push(...(await images([() => wholeImage(item.image_url)])));
          return { content };
        }

        const content = [text(head + siteMarkdown(item, { ...opts, imagesAttached: screenshot }))];
        const desktop = latestCaptureOf(item, "desktop");
        if (screenshot && desktop?.full_url) {
          try {
            const section = await captureSection(desktop.full_url, "desktop", 1);
            content.push(
              text(
                `Desktop screenshot, part 1 of ${section.count} (the top ${section.bottom}px of a ${section.height}px page).` +
                  (section.count > 1 ? ` Call get_screenshot with part 2 to keep scrolling.` : "") +
                  (latestCaptureOf(item, "mobile") ? " A mobile capture exists too (viewport: mobile)." : "")
              ),
              section.image
            );
          } catch (err) {
            content.push(text(`The screenshot couldn't be loaded (${err.message}).`));
          }
        } else if (screenshot) {
          content.push(text("This site has no desktop screenshot yet."));
        }
        return { content };
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "get_screenshot",
    {
      title: "Look at part of a page",
      description:
        "One section of a saved website's full-page screenshot, top to bottom. Pages are cut into numbered sections about a screen tall; the response says how many there are.",
      inputSchema: {
        id: z.string().describe("The website's id."),
        viewport: z.enum(["desktop", "mobile"]).optional().describe("Defaults to desktop."),
        part: z.number().int().min(1).optional().describe("Which section, from 1 at the top. Defaults to 1."),
      },
      annotations: { title: "Look at part of a page", ...READ_ONLY },
    },
    async ({ id, viewport = "desktop", part = 1 }) => {
      try {
        const site = await loadOne(supabase, owner.id, "site", id, { shared });
        if (!site) return { isError: true, content: [text("No website with that id in this library.")] };
        const shot = latestCaptureOf(site, viewport);
        if (!shot?.full_url) return { isError: true, content: [text(`This site has no ${viewport} screenshot.`)] };
        const section = await captureSection(shot.full_url, viewport, part);
        const name = site.name || site.domain;
        return {
          content: [
            text(
              `${name}, ${viewport}: part ${section.part} of ${section.count} (pixels ${section.top}-${section.bottom} of ${section.height}).` +
                (section.part < section.count ? ` Part ${section.part + 1} continues down the page.` : " This is the bottom of the page.")
            ),
            section.image,
          ],
        };
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "find_similar",
    {
      title: "Find similar saves",
      description:
        "Ranks the rest of the library against one website or component by shared tags, shared typefaces and rare words in common, and says what each result shares. No AI judgement involved: the tags are the owner's curated vocabulary.",
      inputSchema: {
        kind: z.enum(["site", "component"]).describe("The kind of the save to compare against."),
        id: z.string().describe("Its id."),
        limit: z.number().int().min(1).max(20).optional().describe("Defaults to 8."),
      },
      annotations: { title: "Find similar saves", ...READ_ONLY },
    },
    async ({ kind, id, limit = 8 }) => {
      try {
        const result = await findSimilar(supabase, owner.id, kind, id, { limit, shared });
        if (!result) return { isError: true, content: [text(`No ${kind} with that id in this library.`)] };
        const name = result.subject.item.name || result.subject.item.domain || "that save";
        if (!result.ranked.length) return { content: [text(`Nothing else in the library shares tags or type with ${name}.`)] };
        const out = [`Most like ${name}, closest first:`, ""];
        for (const c of result.ranked) {
          const why = [
            c.sharedTags.length && `shares ${c.sharedTags.join(", ")}`,
            c.sharedFonts.length && `same type: ${c.sharedFonts.join(", ")}`,
          ]
            .filter(Boolean)
            .join("; ");
          const label = c.item.name || c.item.domain || "Untitled";
          out.push(`- **${label}** (${c.kind}, id: ${c.item.id})${why ? ` — ${why}` : " — similar wording"}`);
        }
        return { content: [text(out.join("\n"))] };
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "list_collections",
    {
      title: "List collections",
      description: "The owner's hand-made collections, with how many saves of each kind are in each.",
      inputSchema: {},
      annotations: { title: "List collections", ...READ_ONLY },
    },
    async () => {
      try {
        const all = await listCollections(supabase, owner.id);
        if (!all.length) return { content: [text("This library has no collections yet.")] };
        const lines = all.map((c) => {
          const counts = [
            c.sites && plural(c.sites, "website"),
            c.components && plural(c.components, "component"),
            c.resources && plural(c.resources, "resource"),
          ].filter(Boolean);
          return `- **${c.name}** (id: ${c.id}) — ${counts.join(", ") || "empty"}`;
        });
        return { content: [text(lines.join("\n"))] };
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "get_collection",
    {
      title: "Open a collection",
      description:
        "A whole collection: what its saves have in common, then each one in detail, with a thumbnail of each website's page. Accepts an id or the collection's name.",
      inputSchema: {
        id: z.string().optional().describe("The collection's id."),
        name: z.string().optional().describe("Or its name, if the id isn't known."),
        thumbnails: z.boolean().optional().describe("Attach a thumbnail of each website (up to 8). Defaults to true."),
      },
      annotations: { title: "Open a collection", ...READ_ONLY },
    },
    async ({ id, name, thumbnails = true }) => {
      try {
        if (!id && !name) return { isError: true, content: [text("Give a collection id or name.")] };
        const collectionId = await findCollectionId(supabase, owner.id, { id, name });
        if (!collectionId) return { isError: true, content: [text(`No single collection matches "${name}". list_collections shows them all.`)] };
        const group = await loadCollection(supabase, owner.id, collectionId, { shared });
        if (!group) return { isError: true, content: [text("No collection with that id in this library.")] };
        const md = collectionMarkdown(group, { exportedAt: exportedAt(), shared, sourceUrl: `${origin}/collections/${collectionId}` });
        const content = [text(`collection id: ${collectionId}\n\n${md}`)];
        if (thumbnails) {
          const withShots = group.sites.filter((s) => latestCaptureOf(s, "desktop")?.full_url).slice(0, 8);
          if (withShots.length) {
            content.push(text(`Thumbnails, top of each page: ${withShots.map((s) => s.name || s.domain).join(", ")}.`));
            content.push(...(await images(withShots.map((s) => () => thumbnail(latestCaptureOf(s, "desktop").full_url)))));
          }
        }
        return { content };
      } catch (err) {
        return failure(err);
      }
    }
  );

  server.registerTool(
    "list_tags",
    {
      title: "List the tag vocabulary",
      description:
        "The owner's approved tags, grouped by what they describe (blocks, page type, aesthetic, industry, resource type, medium), with how many saves carry each.",
      inputSchema: {
        facet: z
          .enum(["block_pattern", "page_type", "aesthetic", "vertical", "resource_type", "medium"])
          .optional()
          .describe("Only one group."),
      },
      annotations: { title: "List the tag vocabulary", ...READ_ONLY },
    },
    async ({ facet }) => {
      try {
        const tags = await listTags(supabase, owner.id, facet);
        if (!tags.length) return { content: [text("No tags in use yet.")] };
        const groups = new Map();
        for (const t of tags) {
          if (!groups.has(t.facet)) groups.set(t.facet, []);
          groups.get(t.facet).push(t);
        }
        const out = [];
        for (const [f, list] of groups) {
          list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
          out.push(`## ${FACET_NAMES[f] || f}`, list.map((t) => `${t.label} (${t.count})`).join(", "), "");
        }
        return { content: [text(out.join("\n").trim())] };
      } catch (err) {
        return failure(err);
      }
    }
  );

  return server;
}

const FACET_NAMES = {
  block_pattern: "Blocks",
  page_type: "Page type",
  aesthetic: "Aesthetic",
  vertical: "Industry",
  resource_type: "Resource type",
  medium: "Medium",
};

// Fetches several images at once and drops any that fail, saying so: one
// missing thumbnail is no reason to lose the other seven, or the text.
async function images(loaders) {
  const settled = await Promise.allSettled(loaders.map((load) => load()));
  const out = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  const failed = settled.length - out.length;
  if (failed) out.push(text(`${plural(failed, "image")} couldn't be loaded.`));
  return out;
}
