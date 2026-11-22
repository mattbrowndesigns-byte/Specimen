import { z } from "zod";
import { attachTags } from "@/lib/tagAttach";
import { runResourceEnrichment } from "@/lib/enrichResource";
import { quotaExhaustedUntil } from "@/lib/quotaState";
import { ownsCollection } from "@/lib/ownership";
import {
  COLLECTABLE,
  addToCollection,
  findOrCreateCollection,
  queueSite,
  saveResource,
  saveSite,
} from "@/lib/saves";
import { plural } from "@/lib/mcp/format";

// The half of the MCP server that adds to a library: save a website, save a
// resource, make a collection, file things into one. Never registered for the
// demo, which has no owner to add things for -- that address stays read-only
// by not having these tools at all, rather than by refusing them.
//
// Nothing here deletes, merges, retags or edits. An AI that misreads a request
// should leave something to tidy up, never something to recover, and every one
// of these is undone in the app with a click.
//
// Saves go through lib/saves.js, the same functions the Add box and the
// collection modal call, so a website saved from a chat is the same save as
// one pasted into the app.

// How many websites one call photographs right away. Each is a page fetch, a
// favicon resolution and a capture dispatch inside one request with a
// 60-second ceiling; past this they go to the capture queue, the import's way
// in, which photographs eight every fifteen minutes.
const SITES_NOW = 3;

// How many new resources one call describes and files right away. Each is a
// Gemini request out of twenty a day for the whole deployment, made in
// parallel; the rest are queued and the enrichment queue files them.
const RESOURCES_NOW = 3;

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value) => ({ type: "text", text: value });

const KIND_WORDS = { site: "website", component: "component", resource: "resource", visual: "visual" };

export function registerWriteTools(server, { owner, supabase, link }) {
  const items = (noun, extra = {}) =>
    z
      .array(
        z.object({
          url: z.string().describe(`The ${noun}'s address.`),
          ...extra,
          note: z
            .string()
            .optional()
            .describe("Why it's worth keeping, in the owner's words. Stored as the save's note, which carries the most weight later."),
        })
      )
      .min(1)
      .max(10);

  const collectionArg = z
    .string()
    .optional()
    .describe(
      "A collection to file the saves in, by name. Matched exactly (ignoring case); if no collection has that name, a new one is made."
    );

  // A name, or an id the owner holds. An id that isn't theirs is treated as a
  // name, which makes a collection literally called that rather than reaching
  // into someone else's.
  async function resolveCollection(value) {
    const wanted = (value || "").trim();
    if (UUID.test(wanted) && (await ownsCollection(supabase, wanted, owner.id))) {
      const { data } = await supabase.from("collection").select("id, name").eq("id", wanted).single();
      return { collection: data, created: false };
    }
    return findOrCreateCollection(supabase, owner.id, wanted);
  }

  async function file(collectionName, targets) {
    if (!collectionName?.trim() || !targets.length) return null;
    const { collection, created } = await resolveCollection(collectionName);
    const settled = await Promise.allSettled(
      targets.map(({ kind, id }) => addToCollection(supabase, owner.id, collection.id, kind, id))
    );
    const failed = settled.filter((s) => s.status === "rejected").length;
    const added = targets.length - failed;
    const where = `${created ? "a new collection" : "the collection"} **${collection.name}** (id: ${collection.id})`;
    return `${created ? "Made" : "Filed in"} ${where}${created ? `, with ${plural(added, "save")} in it` : `: ${plural(added, "save")} added`}.${failed ? ` ${plural(failed, "save")} couldn't be added.` : ""}`;
  }

  // Said once at the foot of a save, when it's true: the day's model budget is
  // spent, so tags arrive after the reset rather than in a few minutes.
  async function budgetNote() {
    const until = await quotaExhaustedUntil();
    if (!until) return null;
    return `Today's free AI budget is used up, so tags and summaries will be filled in after it resets (${until.toISOString()}). Screenshots aren't affected.`;
  }

  server.registerTool(
    "save_websites",
    {
      title: "Save websites",
      description: `Save websites to the library for their design. Each gets full-page desktop and mobile screenshots, a measured colour palette and typefaces, and AI tags and a summary. Up to ${SITES_NOW} are photographed straight away (a few minutes); more than that are queued and photographed within a few hours. A site already in the library is not saved twice. Optionally files them all in a collection. For a tool, reference, font or anything saved for what it does rather than how it looks, use save_resources.`,
      inputSchema: { sites: items("website"), collection: collectionArg },
      annotations: { title: "Save websites", ...WRITE, openWorldHint: true },
    },
    async ({ sites, collection }) => {
      const now = sites.length <= SITES_NOW;
      const settled = await Promise.allSettled(
        sites.map(({ url, note }) =>
          now
            ? saveSite(supabase, owner.id, url, { notes: note, dedupe: true })
            : queueSite(supabase, owner.id, url, { notes: note })
        )
      );

      const lines = [];
      const targets = [];
      settled.forEach((result, i) => {
        if (result.status === "rejected") {
          lines.push(`- ${sites[i].url}: couldn't save it. ${result.reason?.message || ""}`.trim());
          return;
        }
        const { site, existing, queued } = result.value;
        targets.push({ kind: "site", id: site.id });
        const label = `**${site.name || site.domain}** (${site.domain})`;
        const state = existing
          ? "was already in the library"
          : queued
            ? "saved; screenshots within a few hours"
            : "saved; screenshots and tags in a few minutes";
        lines.push(`- ${label} ${state} · id: ${site.id} · ${link("site", site.id)}`);
      });

      const out = [lines.join("\n")];
      try {
        const filed = await file(collection, targets);
        if (filed) out.push(filed);
      } catch (err) {
        out.push(`Saved, but couldn't file them in "${collection}": ${err.message}`);
      }
      const saved = settled.filter((s) => s.status === "fulfilled" && !s.value.existing).length;
      if (saved) {
        const note = await budgetNote();
        if (note) out.push(note);
      }
      const failed = settled.filter((s) => s.status === "rejected").length;
      return { isError: failed === sites.length, content: [text(out.join("\n\n"))] };
    }
  );

  server.registerTool(
    "save_resources",
    {
      title: "Save resources",
      description: `Save resources to the library: links kept for what they do rather than how they look, such as typefaces, icon sets, tools, references, articles and portfolios. Each is described and sorted into the library's folders by AI; the first ${RESOURCES_NOW} straight away, the rest within the hour. A link already saved is not saved twice. Optionally files them all in a collection. For a website kept for its design, use save_websites.`,
      inputSchema: {
        resources: items("resource", {
          title: z
            .string()
            .optional()
            .describe(
              "What to call it, when the page's own title won't say: the typeface's name for a font specimen page, say. Left out, the page's title is used."
            ),
        }),
        collection: collectionArg,
      },
      annotations: { title: "Save resources", ...WRITE, openWorldHint: true },
    },
    async ({ resources, collection }) => {
      const settled = await Promise.allSettled(
        resources.map(({ url, note, title }) =>
          saveResource(supabase, owner.id, url, { notes: note, title, dedupe: true })
        )
      );

      const fresh = settled
        .filter((s) => s.status === "fulfilled" && !s.value.existing)
        .map((s) => s.value.resource.id);
      const describeNow = fresh.slice(0, RESOURCES_NOW);
      const later = fresh.slice(RESOURCES_NOW);

      // The queue reads these two columns; the same way an import leaves them.
      if (later.length) {
        await supabase
          .from("resource")
          .update({ enrichment_state: "queued", enrichment_next_at: new Date().toISOString() })
          .in("id", later)
          .eq("user_id", owner.id);
      }
      // runResourceEnrichment queues its own failures, so a refused request
      // leaves the row waiting its turn rather than undescribed for good.
      await Promise.allSettled(describeNow.map((id) => runResourceEnrichment(id)));

      // Read back after describing, so the answer carries the title and
      // folder the AI just chose rather than the page's own <title>.
      const ids = settled.filter((s) => s.status === "fulfilled").map((s) => s.value.resource.id);
      const { data: rows } = ids.length
        ? await supabase.from("resource").select("id, title, domain, enriched_at").in("id", ids).eq("user_id", owner.id)
        : { data: [] };
      const byId = new Map((await attachTags(supabase, rows || [], "resource")).map((r) => [r.id, r]));

      const lines = [];
      const targets = [];
      settled.forEach((result, i) => {
        if (result.status === "rejected") {
          lines.push(`- ${resources[i].url}: couldn't save it. ${result.reason?.message || ""}`.trim());
          return;
        }
        const { resource, existing } = result.value;
        targets.push({ kind: "resource", id: resource.id });
        const row = byId.get(resource.id) || resource;
        const folders = (row.tags || []).filter((t) => t.facet === "resource_type").map((t) => t.label);
        const state = existing
          ? "was already in the library"
          : folders.length
            ? `saved in ${folders.join(" and ")}`
            : later.includes(resource.id) || !row.enriched_at
              ? "saved; it'll be described and sorted into a folder within the hour"
              : "saved";
        lines.push(`- **${row.title || row.domain}** (${row.domain}) ${state} · id: ${resource.id}`);
      });

      const out = [lines.join("\n")];
      try {
        const filed = await file(collection, targets);
        if (filed) out.push(filed);
      } catch (err) {
        out.push(`Saved, but couldn't file them in "${collection}": ${err.message}`);
      }
      if (fresh.length) {
        const note = await budgetNote();
        if (note) out.push(note);
      }
      const failed = settled.filter((s) => s.status === "rejected").length;
      return { isError: failed === resources.length, content: [text(out.join("\n\n"))] };
    }
  );

  server.registerTool(
    "create_collection",
    {
      title: "Make a collection",
      description:
        "Make a new, empty collection, such as one for a research project. If one with that name already exists, says so and returns it. To make one and fill it in a single step, pass a collection name to save_websites, save_resources or add_to_collection instead.",
      inputSchema: { name: z.string().min(1).max(120).describe("The collection's name.") },
      annotations: { title: "Make a collection", ...WRITE, openWorldHint: false },
    },
    async ({ name }) => {
      try {
        const { collection, created } = await findOrCreateCollection(supabase, owner.id, name);
        return {
          content: [
            text(
              created
                ? `Made the collection **${collection.name}** (id: ${collection.id}).`
                : `There's already a collection called **${collection.name}** (id: ${collection.id}), so no new one was made.`
            ),
          ],
        };
      } catch (err) {
        return { isError: true, content: [text(err.message)] };
      }
    }
  );

  server.registerTool(
    "add_to_collection",
    {
      title: "Add saves to a collection",
      description:
        "File saves that are already in the library into a collection, by their ids from search_library. Takes the collection's id or name; a name with no matching collection makes a new one. Something already in the collection is left as it is.",
      inputSchema: {
        collection: z.string().min(1).describe("The collection's id, or its name."),
        items: z
          .array(
            z.object({
              kind: z.enum(COLLECTABLE).describe("The kind of save, as search_library returns it."),
              id: z.string().describe("The save's id."),
            })
          )
          .min(1)
          .max(30),
      },
      annotations: { title: "Add saves to a collection", ...WRITE, openWorldHint: false },
    },
    async ({ collection: wanted, items: targets }) => {
      try {
        const { collection, created } = await resolveCollection(wanted);
        const settled = await Promise.allSettled(
          targets.map(({ kind, id }) => addToCollection(supabase, owner.id, collection.id, kind, id))
        );
        const missing = targets.filter((_, i) => settled[i].status === "rejected");
        const added = targets.length - missing.length;
        const out = [
          `${created ? `Made a new collection **${collection.name}** and added` : `Added`} ${plural(added, "save")}${created ? "" : ` to **${collection.name}**`} (id: ${collection.id}).`,
        ];
        if (missing.length) {
          out.push(
            `Not found in this library: ${missing.map((m) => `${KIND_WORDS[m.kind]} ${m.id}`).join(", ")}. search_library gives the right ids.`
          );
        }
        return { isError: added === 0, content: [text(out.join("\n\n"))] };
      } catch (err) {
        return { isError: true, content: [text(err.message)] };
      }
    }
  );
}
