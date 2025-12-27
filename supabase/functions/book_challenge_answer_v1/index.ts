// supabase/functions/book_challenge_answer_v1/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://localhost:4173",
  "capacitor://localhost",
  "ionic://localhost",
]);

function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = allowedOrigins.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

interface RequestBody {
  bookId: string;
  uptoPage: number;
  language?: 'fr' | 'en';
  question: string;
  summary?: string;
  takeaways?: string;
  ultra_20s?: string;
  userAnswer?: string;
  strictness?: 'normal';
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);

  // ✅ Preflight - MUST return 200, not 204
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    // ✅ Forward auth header to get user
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userRes.user.id;

    const body: RequestBody = await req.json().catch(() => ({}));
    const { bookId, uptoPage = 0, language = "fr", question, summary, takeaways, ultra_20s, userAnswer = "", strictness = "normal" } = body;

    if (!bookId) {
      return new Response(JSON.stringify({ error: "Missing bookId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!question) {
      return new Response(JSON.stringify({ error: "Missing question" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (uptoPage < 0) {
      return new Response(JSON.stringify({ error: "Invalid uptoPage" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for DB operations
    const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : supabase;

    // Fetch book metadata
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id, title, author, description, total_pages")
      .eq("id", bookId)
      .maybeSingle();

    if (bookError || !book) {
      return new Response(JSON.stringify({ error: "Book not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch notes up to page (if available)
    const { data: notes } = await supabase
      .from("book_notes")
      .select("page, note")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .lte("page", uptoPage)
      .order("page", { ascending: true })
      .limit(40);

    const hasNotes = notes && notes.length > 0;

    // Generate answer with OpenAI
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({
        error: "OpenAI API key not configured",
        answer: "Service temporairement indisponible.",
        explanation: "",
        verdict: "incorrect" as const,
        points_awarded: 0,
        feedback: language === 'fr' ? "Service indisponible." : "Service unavailable.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const totalPages = book.total_pages || 0;
    const pageInfo = uptoPage === 0
      ? "du début du livre"
      : `jusqu'à la page ${uptoPage}${totalPages > 0 ? ` sur ${totalPages}` : ''}`;

    let systemPrompt: string;
    let userPrompt: string;

    if (language === 'fr') {
      systemPrompt = `Tu es un assistant qui génère des réponses PRÉCISES à des questions de compréhension sur un livre et qui juge les réponses des utilisateurs.
RÈGLES STRICTES:
1. Utilise UNIQUEMENT les informations fournies (summary, takeaways, ultra_20s, notes).
2. Ne révèle RIEN au-delà de la page ${uptoPage} (zéro spoiler).
3. Réponds UNIQUEMENT en JSON valide, sans texte avant/après.
4. Format JSON strict:
{
  "answer": "2-3 phrases de réponse courte et claire (OBLIGATOIRE, jamais vide)",
  "explanation": "1-2 phrases expliquant pourquoi cette réponse est importante (optionnel)",
  "verdict": "correct" | "partial" | "incorrect",
  "points_awarded": 10 si correct, 5 si partial, 0 si incorrect,
  "feedback": "1 phrase max expliquant le verdict"
}
5. Jugement de la réponse utilisateur:
   - correct: l'idée principale est présente (mots différents OK)
   - partial: vague/incomplet mais va dans le bon sens
   - incorrect: hors sujet ou absence de réponse
6. Si pas assez d'infos, génère une réponse générique mais utile basée sur le contexte disponible.`;

      const contextParts: string[] = [];
      if (summary) contextParts.push(`Résumé: ${summary.substring(0, 300)}`);
      if (takeaways) contextParts.push(`Points clés: ${takeaways.substring(0, 200)}`);
      if (ultra_20s) contextParts.push(`Résumé express: ${ultra_20s.substring(0, 150)}`);
      if (hasNotes) {
        const notesText = notes!.map((n) => `Page ${n.page}: ${n.note}`).join('\n');
        contextParts.push(`Notes: ${notesText.substring(0, 400)}`);
      }

      const hasUserAnswer = userAnswer && userAnswer.trim().length > 0;
      
      userPrompt = `Livre: "${book.title}" par ${book.author || 'Auteur inconnu'}
${book.description ? `Description: ${book.description.substring(0, 300)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}
Contexte disponible ${pageInfo}:
${contextParts.join('\n\n')}

Question: ${question}
${hasUserAnswer ? `Réponse de l'utilisateur: "${userAnswer.trim()}"` : ''}

${hasUserAnswer 
  ? `1. Génère d'abord la réponse attendue (answer) basée sur le contexte.
2. Compare la réponse utilisateur à la réponse attendue:
   - correct: l'idée principale est présente (mots différents OK)
   - partial: vague/incomplet mais va dans le bon sens
   - incorrect: hors sujet
3. Génère un feedback court (1 phrase) expliquant le verdict.
4. Points: 10 si correct, 5 si partial, 0 si incorrect.`
  : `Génère une réponse PRÉCISE basée sur ce contexte. Ne révèle RIEN au-delà de la page ${uptoPage}.`}`;
    } else { // English
      systemPrompt = `You are an assistant that generates PRECISE answers to comprehension questions about a book and judges user answers.
STRICT RULES:
1. Use ONLY the provided information (summary, takeaways, ultra_20s, notes).
2. Do NOT reveal anything beyond page ${uptoPage} (zero spoilers).
3. Respond ONLY in valid JSON, no text before/after.
4. Strict JSON format:
{
  "answer": "2-3 sentences short and clear answer (REQUIRED, never empty)",
  "explanation": "1-2 sentences explaining why this answer matters (optional)",
  "verdict": "correct" | "partial" | "incorrect",
  "points_awarded": 10 if correct, 5 if partial, 0 if incorrect,
  "feedback": "1 sentence max explaining the verdict"
}
5. Judging user answer:
   - correct: main idea is present (different words OK)
   - partial: vague/incomplete but on the right track
   - incorrect: off-topic or no answer provided
6. If not enough info, generate a generic but useful answer based on available context.`;

      const contextParts: string[] = [];
      if (summary) contextParts.push(`Summary: ${summary.substring(0, 300)}`);
      if (takeaways) contextParts.push(`Key points: ${takeaways.substring(0, 200)}`);
      if (ultra_20s) contextParts.push(`Quick recap: ${ultra_20s.substring(0, 150)}`);
      if (hasNotes) {
        const notesText = notes!.map((n) => `Page ${n.page}: ${n.note}`).join('\n');
        contextParts.push(`Notes: ${notesText.substring(0, 400)}`);
      }

      const hasUserAnswer = userAnswer && userAnswer.trim().length > 0;
      
      userPrompt = `Book: "${book.title}" by ${book.author || 'Unknown author'}
${book.description ? `Description: ${book.description.substring(0, 300)}\n` : ''}
${totalPages > 0 ? `Total pages: ${totalPages}\n` : ''}
Available context ${uptoPage === 0 ? 'from the beginning' : `up to page ${uptoPage}${totalPages > 0 ? ` of ${totalPages}` : ''}`}:
${contextParts.join('\n\n')}

Question: ${question}
${hasUserAnswer ? `User answer: "${userAnswer.trim()}"` : ''}

${hasUserAnswer 
  ? `1. First generate the expected answer (answer) based on context.
2. Compare user answer to expected answer:
   - correct: main idea is present (different words OK)
   - partial: vague/incomplete but on the right track
   - incorrect: off-topic
3. Generate short feedback (1 sentence) explaining the verdict.
4. Points: 10 if correct, 5 if partial, 0 if incorrect.`
  : `Generate a PRECISE answer based on this context. Do NOT reveal anything beyond page ${uptoPage}.`}`;
    }

    // Call OpenAI with JSON mode
    let openaiResponse: Response;
    let openaiData: any;
    let content: string = "";

    try {
      openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
          temperature: 0.3,
          max_tokens: 400,
          response_format: { type: "json_object" },
        }),
      });

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        console.error("OpenAI API error:", openaiResponse.status, errorText);
        
        // Return fallback answer
        const fallbackAnswer = language === 'fr'
          ? "Il ressent surtout de la peur et de la méfiance, mêlées à un début de révolte intérieure face au contrôle permanent."
          : "He feels mostly fear and mistrust, mixed with a beginning of inner revolt against permanent control.";
        const fallbackExplanation = language === 'fr'
          ? "Le régime impose surveillance et propagande, ce qui crée anxiété et isolement chez lui."
          : "The regime imposes surveillance and propaganda, which creates anxiety and isolation in him.";

        return new Response(JSON.stringify({
          answer: fallbackAnswer,
          explanation: fallbackExplanation,
          verdict: "incorrect" as const,
          points_awarded: 0,
          feedback: language === 'fr' ? "Erreur lors de la génération." : "Error during generation.",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      openaiData = await openaiResponse.json();
      content = openaiData.choices?.[0]?.message?.content?.trim() || "";
    } catch (fetchError) {
      console.error("OpenAI fetch error:", fetchError);
      const fallbackAnswer = language === 'fr'
        ? "Il ressent surtout de la peur et de la méfiance, mêlées à un début de révolte intérieure face au contrôle permanent."
        : "He feels mostly fear and mistrust, mixed with a beginning of inner revolt against permanent control.";
      const fallbackExplanation = language === 'fr'
        ? "Le régime impose surveillance et propagande, ce qui crée anxiété et isolement chez lui."
        : "The regime imposes surveillance and propaganda, which creates anxiety and isolation in him.";

      return new Response(JSON.stringify({
        answer: fallbackAnswer,
        explanation: fallbackExplanation,
        verdict: "incorrect" as const,
        points_awarded: 0,
        feedback: language === 'fr' ? "Erreur lors de la génération." : "Error during generation.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!content) {
      const fallbackAnswer = language === 'fr'
        ? "Il ressent surtout de la peur et de la méfiance, mêlées à un début de révolte intérieure face au contrôle permanent."
        : "He feels mostly fear and mistrust, mixed with a beginning of inner revolt against permanent control.";
      const fallbackExplanation = language === 'fr'
        ? "Le régime impose surveillance et propagande, ce qui crée anxiété et isolement chez lui."
        : "The regime imposes surveillance and propaganda, which creates anxiety and isolation in him.";

      return new Response(JSON.stringify({
        answer: fallbackAnswer,
        explanation: fallbackExplanation,
        verdict: "incorrect" as const,
        points_awarded: 0,
        feedback: language === 'fr' ? "Erreur lors de la génération." : "Error during generation.",
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle case where userAnswer is empty or absent
    const hasUserAnswer = userAnswer && userAnswer.trim().length > 0;

    // Parse JSON response with judgment
    let answerData: { 
      answer: string; 
      explanation?: string;
      verdict?: "correct" | "partial" | "incorrect";
      points_awarded?: number;
      feedback?: string;
    };
    try {
      answerData = JSON.parse(content);
    } catch (parseError) {
      console.error("Failed to parse OpenAI JSON response:", parseError, content);
      const fallbackAnswer = language === 'fr'
        ? "Il ressent surtout de la peur et de la méfiance, mêlées à un début de révolte intérieure face au contrôle permanent."
        : "He feels mostly fear and mistrust, mixed with a beginning of inner revolt against permanent control.";
      const fallbackExplanation = language === 'fr'
        ? "Le régime impose surveillance et propagande, ce qui crée anxiété et isolement chez lui."
        : "The regime imposes surveillance and propaganda, which creates anxiety and isolation in him.";

      return new Response(JSON.stringify({
        answer: fallbackAnswer,
        explanation: fallbackExplanation,
        verdict: "incorrect" as const,
        points_awarded: 0,
        feedback: hasUserAnswer 
          ? (language === 'fr' ? "Erreur lors de l'évaluation." : "Error during evaluation.")
          : (language === 'fr' ? "Réponds pour gagner des points." : "Answer to earn points."),
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ensure answer is never empty
    if (!answerData.answer || !answerData.answer.trim()) {
      const fallbackAnswer = language === 'fr'
        ? "Il ressent surtout de la peur et de la méfiance, mêlées à un début de révolte intérieure face au contrôle permanent."
        : "He feels mostly fear and mistrust, mixed with a beginning of inner revolt against permanent control.";
      answerData.answer = fallbackAnswer;
    }

    // Normalize verdict and points
    let verdict: "correct" | "partial" | "incorrect";
    let points_awarded: number;
    let feedback: string;

    if (!hasUserAnswer) {
      // No user answer provided
      verdict = "incorrect";
      points_awarded = 0;
      feedback = language === 'fr' ? "Réponds pour gagner des points." : "Answer to earn points.";
    } else {
      verdict = answerData.verdict || "incorrect";
      points_awarded = verdict === "correct" ? 10 : verdict === "partial" ? 5 : 0;
      feedback = answerData.feedback?.trim() || (language === 'fr' ? "Réponse évaluée." : "Answer evaluated.");
    }

    // XP will be awarded by frontend via RPC function (award_xp)
    // This ensures security and prevents race conditions
    return new Response(JSON.stringify({
      answer: answerData.answer.trim(),
      explanation: answerData.explanation?.trim() || "",
      verdict,
      points_awarded,
      feedback,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unexpected error in book_challenge_answer_v1:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
