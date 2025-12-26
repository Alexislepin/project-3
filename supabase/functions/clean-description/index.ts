import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";

interface RequestBody {
  bookId?: string;
  raw: string;
  targetLang?: string;
}

serve(async (req) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { bookId, raw, targetLang = "fr" } = body;

    // Validate input
    if (!raw || typeof raw !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'raw' field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Skip AI if text is too short
    if (raw.trim().length < 30) {
      return new Response(
        JSON.stringify({ 
          clean: raw.trim() || "Aucun résumé disponible.",
          skipped: true 
        }),
        { 
          status: 200, 
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          } 
        }
      );
    }

    // Check OpenAI API key
    if (!OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call OpenAI API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Use cheaper model for this task
        messages: [
          {
            role: "system",
            content: "Tu réécris des résumés de livres. N'invente aucun fait. Si tu ne sais pas, garde général. Réponds UNIQUEMENT avec le résumé reformulé, sans préambule ni explication.",
          },
          {
            role: "user",
            content: `Texte: ${raw}\n\nTâche: Si pas en français → traduire en français. Reformuler en 2-3 phrases max. Style neutre et clair. Sans ajouter d'infos qui ne sont pas dans le texte original.`,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent, factual output
        max_tokens: 200, // Limit to ~2-3 sentences
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to process description" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const cleanDescription = openaiData.choices?.[0]?.message?.content?.trim() || raw;

    // Truncate to ~400 characters max
    const truncated = cleanDescription.length > 400 
      ? cleanDescription.substring(0, 397) + "..." 
      : cleanDescription;

    // Update database if bookId provided
    if (bookId && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { error: updateError } = await supabase
          .from("books")
          .update({
            description_clean: truncated,
            description_clean_updated_at: new Date().toISOString(),
          })
          .eq("id", bookId);

        if (updateError) {
          console.error("Failed to update database:", updateError);
          // Don't fail the request, just log the error
        }
      } catch (dbError) {
        console.error("Database update error:", dbError);
        // Continue anyway
      }
    }

    return new Response(
      JSON.stringify({ clean: truncated }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error in clean-description function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

