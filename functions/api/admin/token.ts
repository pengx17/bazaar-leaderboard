interface Env {
  DB: D1Database;
  ADMIN_SECRET?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const db = context.env.DB;
  const adminSecret = context.env.ADMIN_SECRET;

  // Verify admin authorization
  if (!adminSecret) {
    return Response.json(
      { error: "ADMIN_SECRET is not configured" },
      { status: 500, headers: corsHeaders }
    );
  }

  const authHeader = context.request.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders }
    );
  }

  try {
    const body = await context.request.json<{
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
    }>();

    if (!body.accessToken || !body.refreshToken || !body.expiresAt) {
      return Response.json(
        {
          error:
            "Missing required fields: accessToken, refreshToken, expiresAt",
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const now = new Date().toISOString();

    await db
      .prepare(
        `INSERT OR REPLACE INTO auth_tokens (id, access_token, refresh_token, expires_at, updated_at)
         VALUES (1, ?, ?, ?, ?)`
      )
      .bind(body.accessToken, body.refreshToken, body.expiresAt, now)
      .run();

    return Response.json(
      { success: true, updatedAt: now },
      { headers: corsHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json(
      { error: message },
      { status: 500, headers: corsHeaders }
    );
  }
};
