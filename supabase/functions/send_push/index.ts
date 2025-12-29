/**
 * Edge Function: send_push
 * 
 * Sends iOS push notifications via APNs (Apple Push Notification service)
 * 
 * Required Supabase Secrets:
 * - APNS_KEY_ID: Your APNs Key ID (from Apple Developer)
 * - APNS_TEAM_ID: Your Apple Team ID
 * - APNS_BUNDLE_ID: Your app bundle ID (e.g., com.lexu.app)
 * - APNS_KEY: Base64-encoded .p8 key file content
 * 
 * Usage:
 * POST /send_push
 * {
 *   "device_token": "abc123...",
 *   "title": "LEXU.",
 *   "body": "Notification message",
 *   "data": { "type": "like", "activity_id": "..." }
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APNS_HOST = 'api.push.apple.com'; // Production
// const APNS_HOST = 'api.sandbox.push.apple.com'; // Development

interface PushPayload {
  device_token: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  badge?: number;
  sound?: string;
}

interface APNsPayload {
  aps: {
    alert: {
      title: string;
      body: string;
    };
    badge?: number;
    sound?: string;
    'content-available'?: number;
  };
  [key: string]: any; // Custom data
}

/**
 * Generate JWT token for APNs authentication using ES256
 * 
 * Note: This is a simplified implementation. For production, consider using
 * a dedicated JWT library that properly handles ES256 signing with .p8 keys.
 * 
 * Alternative: Use https://deno.land/x/djwt@v2.8 or similar
 */
async function generateAPNsToken(): Promise<string> {
  const keyId = Deno.env.get('APNS_KEY_ID');
  const teamId = Deno.env.get('APNS_TEAM_ID');
  const keyContent = Deno.env.get('APNS_KEY');

  if (!keyId || !teamId || !keyContent) {
    throw new Error('Missing APNs configuration. Set APNS_KEY_ID, APNS_TEAM_ID, and APNS_KEY secrets.');
  }

  // The keyContent should be the full PEM file content (with headers) encoded in base64
  // Decode it
  const keyText = atob(keyContent);

  // Parse PEM key (remove headers and whitespace)
  const pemHeader = '-----BEGIN PRIVATE KEY-----';
  const pemFooter = '-----END PRIVATE KEY-----';
  const pemContent = keyText
    .replace(pemHeader, '')
    .replace(pemFooter, '')
    .replace(/\s/g, '');
  
  const keyBytes = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  // Import key for signing
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    false,
    ['sign']
  );

  // Create JWT header
  const header = {
    alg: 'ES256',
    kid: keyId,
  };

  // Create JWT payload
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: teamId,
    iat: now,
  };

  // Base64URL encode
  const base64UrlEncode = (str: string): string => {
    return btoa(str)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with ECDSA
  const signature = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: 'SHA-256',
    },
    cryptoKey,
    new TextEncoder().encode(signatureInput)
  );

  // Convert signature to base64url
  // Note: ECDSA signatures are DER-encoded, but APNs expects raw r||s format
  // This is a simplified version - you may need to convert DER to raw format
  const signatureArray = new Uint8Array(signature);
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${signatureInput}.${signatureBase64}`;
}

/**
 * Send push notification via APNs
 */
async function sendAPNsPush(deviceToken: string, payload: APNsPayload): Promise<Response> {
  const bundleId = Deno.env.get('APNS_BUNDLE_ID');
  if (!bundleId) {
    throw new Error('Missing APNS_BUNDLE_ID secret');
  }

  // Generate JWT token (simplified - implement proper JWT signing)
  const token = await generateAPNsToken();

  const url = `https://${APNS_HOST}/3/device/${deviceToken}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apns-topic': bundleId,
      'apns-priority': '10',
      'apns-push-type': 'alert',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return response;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const pushData: PushPayload = await req.json();

    // Validate input
    if (!pushData.device_token || !pushData.title || !pushData.body) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: device_token, title, body' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Build APNs payload
    const apnsPayload: APNsPayload = {
      aps: {
        alert: {
          title: pushData.title,
          body: pushData.body,
        },
        sound: pushData.sound || 'default',
        'content-available': 1, // Enable background fetch
      },
      ...pushData.data, // Merge custom data
    };

    if (pushData.badge !== undefined) {
      apnsPayload.aps.badge = pushData.badge;
    }

    // Send push notification
    const apnsResponse = await sendAPNsPush(pushData.device_token, apnsPayload);

    if (!apnsResponse.ok) {
      const errorText = await apnsResponse.text();
      console.error('APNs error:', errorText);
      
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send push notification',
          details: errorText,
          status: apnsResponse.status,
        }),
        {
          status: apnsResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Push notification sent' }),
      {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Error sending push:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});

