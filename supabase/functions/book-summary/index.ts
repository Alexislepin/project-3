import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";

interface RequestBody {
  source?: string; // 'google', 'openlibrary', etc.
  source_id?: string; // book.id from source
  title?: string;
  authors?: string;
  description?: string;
  categories?: string | string[];
  pageCount?: number;
  publishedDate?: string;
  lang?: string; // 'fr', 'en', etc.
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const {
      source = "google",
      source_id,
      title = "",
      authors = "",
      description = "",
      categories = "",
      pageCount,
      publishedDate,
      lang = "fr",
    } = body;

    // Validate required fields
    if (!title || !source_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: title and source_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache first
    if (SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: cached, error: cacheError } = await supabase
        .from("book_summaries")
        .select("summary")
        .eq("source", source)
        .eq("source_id", source_id)
        .eq("lang", lang)
        .maybeSingle();

      if (!cacheError && cached?.summary) {
        return new Response(
          JSON.stringify({ summary: cached.summary }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Generate summary
    let summary: string;

    if (OPENAI_API_KEY) {
      // Use OpenAI if available
      try {
        const categoryStr = Array.isArray(categories)
          ? categories.join(", ")
          : categories || "";
        const year = publishedDate
          ? (publishedDate.match(/\d{4}/)?.[0] || "")
          : "";
        const pagesStr = pageCount ? `${pageCount} pages` : "";

        const systemPrompt = lang === "fr"
          ? "Tu génères des aperçus de livres en EXACTEMENT 2 phrases courtes (max 2 lignes). N'invente aucun fait précis qui n'est pas dans les informations fournies. Style simple, clair, accessible."
          : "You generate book overviews in EXACTLY 2 short sentences (max 2 lines). Do not invent any precise facts not provided in the information. Style simple, clear, accessible.";

        const userPrompt = lang === "fr"
          ? `Titre: ${title}\nAuteur(s): ${authors}\n${categoryStr ? `Genre: ${categoryStr}\n` : ""}${pagesStr ? `Pages: ${pagesStr}\n` : ""}${year ? `Année: ${year}\n` : ""}${description ? `Description originale: ${description.substring(0, 500)}\n\nTâche: Générer un aperçu du livre en 2 phrases courtes maximum, en français, sans spoiler et sans détails inventés. Si la description est vide, reste très général (présente le type de livre, le ton, la cible) sans inventer l'histoire.`
          : `Title: ${title}\nAuthor(s): ${authors}\n${categoryStr ? `Genre: ${categoryStr}\n` : ""}${pagesStr ? `Pages: ${pagesStr}\n` : ""}${year ? `Year: ${year}\n` : ""}${description ? `Original description: ${description.substring(0, 500)}\n\nTask: Generate a book overview in at most 2 short sentences in English, no spoilers and no invented details. If description is empty, stay very general (type of book, tone, audience) without inventing the story.`;

        const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 80,
          }),
        });

        if (!openaiResponse.ok) {
          throw new Error(`OpenAI API error: ${openaiResponse.status}`);
        }

        const openaiData = await openaiResponse.json();
        summary = openaiData.choices?.[0]?.message?.content?.trim() || "";
      } catch (openaiError) {
        console.error("OpenAI error, falling back to template:", openaiError);
        summary = generateFallbackSummary(body, lang);
      }
    } else {
      // Fallback: template-based summary
      summary = generateFallbackSummary(body, lang);
    }

    // Save to cache
    if (SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL && summary) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase
          .from("book_summaries")
          .upsert(
            {
              source,
              source_id,
              lang,
              summary,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "source,source_id,lang" }
          );
      } catch (dbError) {
        console.error("Failed to cache summary:", dbError);
        // Don't fail the request if caching fails
      }
    }

    return new Response(
      JSON.stringify({ summary }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in book-summary function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Fallback template-based summary generator
function generateFallbackSummary(body: RequestBody, lang: string): string {
  const title = (body.title || "").trim() || "Ce livre";
  const authors = (body.authors || "").trim() || "un auteur inconnu";
  const categories = Array.isArray(body.categories)
    ? body.categories.join(", ")
    : (body.categories || "").trim();
  const pageCount = body.pageCount;
  const publishedDate = body.publishedDate;
  const year = publishedDate ? (publishedDate.match(/\d{4}/)?.[0] || "") : "";

  if (lang === "fr") {
    const parts: string[] = [];
    parts.push(`«${title}» est un livre de ${authors}.`);
    
    if (categories) {
      parts.push(`Il s'inscrit dans le genre ${categories}.`);
    }
    
    if (pageCount && pageCount > 0) {
      parts.push(`L'ouvrage compte environ ${pageCount} pages.`);
    }
    
    if (year) {
      parts.push(`Il a été publié autour de ${year}.`);
    }
    
    if (body.description && body.description.trim()) {
      const desc = body.description.replace(/<[^>]+>/g, " ").trim();
      if (desc.length > 0) {
        const shortDesc = desc.length > 200 ? desc.substring(0, 200) + "…" : desc;
        parts.push(`Aperçu: ${shortDesc}`);
      }
    } else {
      parts.push("Aperçu: œuvre dense et immersive.");
    }
    
    return parts.join(" ");
  } else {
    // English fallback
    const parts: string[] = [];
    parts.push(`"${title}" is a book by ${authors}.`);
    
    if (categories) {
      parts.push(`It belongs to the ${categories} genre.`);
    }
    
    if (pageCount && pageCount > 0) {
      parts.push(`The work is approximately ${pageCount} pages long.`);
    }
    
    if (year) {
      parts.push(`It was published around ${year}.`);
    }
    
    if (body.description && body.description.trim()) {
      const desc = body.description.replace(/<[^>]+>/g, " ").trim();
      if (desc.length > 0) {
        const shortDesc = desc.length > 200 ? desc.substring(0, 200) + "…" : desc;
        parts.push(`Overview: ${shortDesc}`);
      }
    } else {
      parts.push("Overview: a dense and immersive work.");
    }
    
    return parts.join(" ");
  }
}

