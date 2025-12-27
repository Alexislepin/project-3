import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'capacitor://localhost',
  'ionic://localhost',
];

function getCorsHeaders(origin: string | null) {
  const originHeader = origin && allowedOrigins.includes(origin) ? origin : '*';
  return {
    "Access-Control-Allow-Origin": originHeader,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(origin), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    if (!OPENAI_API_KEY) {
      return json({ error: "OPENAI_API_KEY not configured" }, 500, origin);
    }

    // Get authenticated user
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { conversation_id, book_key, book_context, user_message } = body ?? {};

    if (!conversation_id || !book_key || !user_message) {
      return json({ error: "Missing required fields" }, 400, origin);
    }

    // Load recent messages from conversation (last 20)
    const { data: messages, error: messagesError } = await supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: true })
      .limit(20);

    if (messagesError) {
      console.error("[ai_chat] Error loading messages:", messagesError);
      return json({ error: "Failed to load conversation" }, 500, origin);
    }

    // Build context for AI
    const bookInfo = book_context || {};
    const contextMessages = [
      {
        role: "system",
        content: `Tu es l'assistant de lecture Lexu. Tu aides les utilisateurs à comprendre, résumer et analyser leurs livres.

Contexte du livre:
- Titre: ${bookInfo.title || "Non spécifié"}
- Auteur: ${bookInfo.author || "Non spécifié"}
- Page actuelle: ${bookInfo.current_page || 0} / ${bookInfo.total_pages || "?"}

Règles importantes:
- Ne spoile JAMAIS au-delà de la page actuelle (${bookInfo.current_page || 0})
- Sois concis mais complet
- Adapte ton langage au contexte (résumé, explication, quiz, etc.)
- Si tu n'as pas assez d'informations, dis-le clairement`,
      },
      ...(messages || []).map((m) => ({
        role: m.role,
        content: m.content,
      })),
      {
        role: "user",
        content: user_message,
      },
    ];

    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: contextMessages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("[ai_chat] OpenAI error:", errorText);
      return json({ error: "AI service error" }, 500, origin);
    }

    const openaiData = await openaiResponse.json();
    const assistantMessage = openaiData.choices?.[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse.";

    return json({
      assistant_message: assistantMessage,
    }, 200, origin);
  } catch (error) {
    console.error("[ai_chat] Error:", error);
    return json({ error: String(error) }, 500, origin);
  }
});

