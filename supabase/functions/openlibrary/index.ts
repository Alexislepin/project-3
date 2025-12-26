import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";

interface OpenLibraryWorkResponse {
  description?: string | { value: string };
  subjects?: string[];
  [key: string]: any;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const workId = url.searchParams.get("workId");

    if (!workId) {
      return new Response(
        JSON.stringify({ error: "Missing workId parameter" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Clean workId: remove /works/ prefix if present, remove leading/trailing slashes
    const cleanWorkId = workId.replace(/^\/works\//, "").replace(/^\/|\/$/g, "");

    if (!cleanWorkId) {
      return new Response(
        JSON.stringify({ error: "Invalid workId format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch from OpenLibrary API
    const openLibraryUrl = `https://openlibrary.org/works/${cleanWorkId}.json`;
    
    const response = await fetch(openLibraryUrl, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      // Return null for 404 or other errors (not a fatal error)
      if (response.status === 404) {
        return new Response(
          JSON.stringify({ description: null, subjects: null }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: `OpenLibrary API error: ${response.status}`,
          description: null,
          subjects: null,
        }),
        {
          status: 200, // Return 200 with null data instead of error
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data: OpenLibraryWorkResponse = await response.json();

    // Extract description (can be string or {value: string})
    let description: string | null = null;
    if (data.description) {
      if (typeof data.description === "string") {
        description = data.description;
      } else if (
        typeof data.description === "object" &&
        typeof data.description.value === "string"
      ) {
        description = data.description.value;
      }
    }

    // Extract subjects
    const subjects = Array.isArray(data.subjects) ? data.subjects : null;

    return new Response(
      JSON.stringify({
        description,
        subjects,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in openlibrary function:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        description: null,
        subjects: null,
      }),
      {
        status: 200, // Return 200 with null data instead of 500
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

