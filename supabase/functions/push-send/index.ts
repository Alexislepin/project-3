import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "https://esm.sh/jose@5.6.3";

serve(async (req) => {
  try {
    const { user_id, title, body, data } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ ok: false, error: "Missing user_id/title/body" }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: devices, error: devErr } = await supabase
      .from("user_devices")
      .select("push_token")
      .eq("user_id", user_id)
      .eq("platform", "ios");

    if (devErr) throw devErr;
    const tokens = (devices ?? []).map((d) => d.push_token).filter(Boolean);

    if (!tokens.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "no ios tokens" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const teamId = Deno.env.get("APNS_TEAM_ID")!;
    const keyId = Deno.env.get("APNS_KEY_ID")!;
    const bundleId = Deno.env.get("APNS_BUNDLE_ID")!;
    const p8 = Deno.env.get("APNS_PRIVATE_KEY_P8")!;

    const privateKey = await importPKCS8(p8, "ES256");
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt()
      .setExpirationTime("45m")
      .sign(privateKey);

    const payload = {
      aps: {
        alert: { title, body },
        sound: "default",
      },
      data: data ?? {},
    };

    const results: any[] = [];
    for (const t of tokens) {
      const res = await fetch(`https://api.push.apple.com/3/device/${t}`, {
        method: "POST",
        headers: {
          authorization: `bearer ${jwt}`,
          "apns-topic": bundleId,
          "apns-push-type": "alert",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const txt = await res.text();
      results.push({ token: t.slice(0, 10) + "...", status: res.status, body: txt });
    }

    return new Response(JSON.stringify({ ok: true, sent: tokens.length, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
