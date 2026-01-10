// supabase/functions/book_enrich_queue_worker/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Work = {
  title?: string;
  covers?: number[];
  authors?: { author?: { key?: string } }[];
};

type Author = { name?: string };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400", // Cache preflight for 24h
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { "User-Agent": "Lexu/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return await r.json();
}

function normalizeOlKey(key: string) {
  // en DB tu as "ol:/works/OLxxxxW" → OpenLibrary veut "/works/OLxxxxW"
  return key.replace(/^ol:/, "");
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 204,
      headers: corsHeaders,
    });
  }
  try {
    const { batchSize = 20 } = await req.json().catch(() => ({}));

    // 1) claim batch
    const { data: claimed, error: claimErr } = await supabase
      .rpc("claim_book_enrich_batch", { batch_size: batchSize });

    if (claimErr) throw claimErr;

    const ids = (claimed ?? []).map((x: any) => x.book_id);
    if (ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) load books
    const { data: books, error: booksErr } = await supabase
      .from("books")
      .select("id, title, author, openlibrary_work_key, openlibrary_cover_id")
      .in("id", ids);

    if (booksErr) throw booksErr;

    let processed = 0;

    for (const b of books ?? []) {
      try {
        const wk = b.openlibrary_work_key;
        if (!wk) throw new Error("missing openlibrary_work_key");

        const workKey = normalizeOlKey(wk); // "/works/OL...W"
        const work = await fetchJson<Work>(`https://openlibrary.org${workKey}.json`);

        const title = work.title?.trim();
        const coverId = Array.isArray(work.covers) && work.covers.length > 0
          ? work.covers[0]
          : null;

        let authorName: string | null = null;
        const authorKey = work.authors?.[0]?.author?.key;
        if (authorKey) {
          const a = await fetchJson<Author>(`https://openlibrary.org${authorKey}.json`);
          authorName = a.name?.trim() ?? null;
        }

        const isPlaceholderTitle =
          !b.title || b.title.trim() === "" || b.title === "(OpenLibrary book)";

        const isMissingAuthor = !b.author || b.author.trim() === "";

        // 3) update book only if missing/placeholder
        const patch: any = {};
        if (isPlaceholderTitle && title) patch.title = title;
        if (isMissingAuthor && authorName) patch.author = authorName;
        if (!b.openlibrary_cover_id && coverId) patch.openlibrary_cover_id = String(coverId);

        if (Object.keys(patch).length > 0) {
          const { error: upErr } = await supabase
            .from("books")
            .update(patch)
            .eq("id", b.id);
          if (upErr) throw upErr;
        }

        await supabase.rpc("finish_book_enrich", { p_book_id: b.id, p_error: null });
        processed++;
      } catch (e) {
        await supabase.rpc("finish_book_enrich", {
          p_book_id: b.id,
          p_error: String(e?.message ?? e),
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

