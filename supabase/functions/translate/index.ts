import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const VERSION = "translate-2025-12-26-1838";
const DEEPL_API_KEY = Deno.env.get("DEEPL_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Get DeepL API endpoint based on API key type
 * Free keys contain ":fx" or start with "fx" → use api-free.deepl.com
 * Paid keys → use api.deepl.com
 */
function getDeeplEndpoint(apiKey: string): string {
  const k = (apiKey || "").trim();
  const isFree = k.includes(":fx") || k.startsWith("fx");
  return isFree
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
}

/**
 * Normalize target language to DeepL format
 */
function normalizeDeeplTarget(target: string): string {
  const normalized = target.toLowerCase().trim();
  if (normalized === "fr") return "FR";
  if (normalized === "en") return "EN-GB";
  if (normalized.startsWith("fr")) return "FR";
  if (normalized.startsWith("en")) return "EN-GB";
  return "FR"; // Default fallback
}

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
    const body = await req.json();
    const { text, target, targetLang } = body;

    // Support both 'target' and 'targetLang' for compatibility
    const finalTarget = (targetLang || target) as "fr" | "en" | undefined;

    if (!text || !text.trim()) {
      return new Response(
        JSON.stringify({ error: "Text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!finalTarget || (finalTarget !== "fr" && finalTarget !== "en")) {
      return new Response(
        JSON.stringify({ error: "Target language must be 'fr' or 'en'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize target for DeepL
    const deeplTarget = normalizeDeeplTarget(finalTarget);

    // Check if DeepL API key is present
    if (!DEEPL_API_KEY) {
      return new Response(
        JSON.stringify({
          translatedText: text,
          meta: {
            version: VERSION,
            provider: "fallback",
            didTranslate: false,
            reason: "missing_deepl_key",
            targetUsed: deeplTarget,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call DeepL API
    const endpoint = getDeeplEndpoint(DEEPL_API_KEY);
    const bodyParams = new URLSearchParams();
    bodyParams.set("text", text);
    bodyParams.set("target_lang", deeplTarget);
    bodyParams.set("preserve_formatting", "1");
    bodyParams.set("tag_handling", "xml");
    bodyParams.set("ignore_tags", "code,pre");

    console.log("[translate] Calling DeepL - endpoint:", endpoint, "target:", deeplTarget);

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyParams.toString(),
    });

    const raw = await resp.text();
    console.log("[translate] DeepL status:", resp.status);

    if (!resp.ok) {
      console.log("[translate] DeepL error body:", raw.slice(0, 200));
      return new Response(
        JSON.stringify({
          translatedText: text,
          meta: {
            version: VERSION,
            provider: "fallback",
            didTranslate: false,
            reason: `deepl_http_${resp.status}`,
            targetUsed: deeplTarget,
            deeplStatus: resp.status,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse DeepL response
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({
          translatedText: text,
          meta: {
            version: VERSION,
            provider: "fallback",
            didTranslate: false,
            reason: "deepl_bad_json",
            targetUsed: deeplTarget,
            deeplStatus: resp.status,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const translated = json?.translations?.[0]?.text;
    if (!translated || typeof translated !== "string" || translated.trim().length === 0) {
      return new Response(
        JSON.stringify({
          translatedText: text,
          meta: {
            version: VERSION,
            provider: "fallback",
            didTranslate: false,
            reason: "deepl_no_translation",
            targetUsed: deeplTarget,
            deeplStatus: resp.status,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success: return translated text
    return new Response(
      JSON.stringify({
        translatedText: translated,
        meta: {
          version: VERSION,
          provider: "deepl",
          didTranslate: true,
          reason: "ok",
          targetUsed: deeplTarget,
          deeplStatus: 200,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[translate] Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
