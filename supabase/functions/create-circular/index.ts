// Create a `circulars` row + kick off parsing (F8 Phase 2).
//
// The admin UI uploads the image to private storage with the admin's JWT
// (the admin-upload storage policy in 0014 gates that), then calls this
// function with the storage path. We do the admin re-check + insert with
// service_role (since circulars has admin-only SELECT and no write
// policy by design — DECISIONS.md 2026-05-02), then fire-and-forget
// `parse-circular` so the admin's "submit" returns immediately and the
// review screen polls for completion.

// deno-lint-ignore-file no-explicit-any

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Payload = {
  circularId?: unknown;
  storeId?: unknown;
  imagePath?: unknown;
  observedWeek?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json().catch(() => null)) as Payload | null;
    const circularId = typeof body?.circularId === 'string' ? body.circularId : null;
    const storeId = typeof body?.storeId === 'string' ? body.storeId : null;
    const imagePath = typeof body?.imagePath === 'string' ? body.imagePath : null;
    const observedWeek = typeof body?.observedWeek === 'string' ? body.observedWeek : null;

    if (!circularId) return jsonError(400, 'Missing circularId');
    if (!storeId) return jsonError(400, 'Missing storeId');
    if (!imagePath) return jsonError(400, 'Missing imagePath');
    if (!observedWeek || !/^\d{4}-\d{2}-\d{2}$/.test(observedWeek)) {
      return jsonError(400, 'observedWeek must be YYYY-MM-DD');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonError(401, 'Missing Authorization header');
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonError(401, 'Empty bearer token');

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: who, error: whoErr } = await userClient.auth.getUser(jwt);
    const adminId = who?.user?.id;
    if (!adminId) return jsonError(401, `Invalid session: ${whoErr?.message ?? 'no user'}`);

    const { data: profile } = await userClient
      .from('profiles')
      .select('is_admin')
      .eq('id', adminId)
      .maybeSingle();
    if (!profile?.is_admin) return jsonError(403, 'Not an admin');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await (admin.from('circulars') as any)
      .insert({
        id: circularId,
        store_id: storeId,
        image_path: imagePath,
        observed_week: observedWeek,
        uploaded_by: adminId,
        parse_status: 'uploaded',
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return jsonError(409, 'A circular with that id already exists');
      if (error.code === '23503') return jsonError(400, 'Unknown store_id');
      return jsonError(500, error.message);
    }

    // Kick off the parser. We pass the same JWT through so parse-circular's
    // admin re-check passes. Fire-and-forget — don't make the admin wait
    // for vision parsing to finish (10-30s). The detail page polls
    // parse_status to surface completion.
    void fetch(`${SUPABASE_URL}/functions/v1/parse-circular`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ circular_id: circularId }),
    }).catch((err) => console.error('parse-circular kickoff failed', err));

    return jsonOk({ ok: true, circularId: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('create-circular failed', message);
    return jsonError(500, message);
  }
});

function jsonOk(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
