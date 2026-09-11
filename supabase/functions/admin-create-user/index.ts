// Edge Function: admin-create-user
// Cria usuário (Auth) + licença, chamada pelo painel admin (admin.js).
// Só quem já é admin (checado via profiles) pode executar.
// A service role key nunca sai daqui — o browser só manda o JWT do admin.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const callerToken = authHeader.replace("Bearer ", "");
    if (!callerToken) {
      return json({ error: "Sem token de autenticação." }, 401);
    }

    // client "como o chamador", só pra confirmar quem está pedindo
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await callerClient.auth.getUser(callerToken);
    if (userErr || !userData?.user) {
      return json({ error: "Token inválido." }, 401);
    }

    const { data: profile, error: profileErr } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profileErr || profile?.role !== "admin") {
      return json({ error: "Só administradores podem criar usuários." }, 403);
    }

    const body = await req.json();
    const email: string = (body.email || "").trim().toLowerCase();
    const fullName: string = (body.full_name || "").trim();
    const plan: string = body.plan || "padrao";
    const expiresAt: string | null = body.expires_at || null;
    const password: string = body.password || crypto.randomUUID().slice(0, 12);

    if (!email) return json({ error: "E-mail é obrigatório." }, 400);

    // admin client de verdade, com service role — só existe dentro da function
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const newUserId = created.user.id;

    // o trigger on_auth_user_created já cria o profile; garante full_name
    await admin.from("profiles").update({ full_name: fullName }).eq("id", newUserId);

    const { error: licenseErr } = await admin.from("licenses").insert({
      user_id: newUserId,
      plan,
      status: "active",
      expires_at: expiresAt,
      created_by: userData.user.id,
    });
    if (licenseErr) return json({ error: licenseErr.message }, 400);

    // gera link de "definir senha" pra mandar pro aluno em vez do password gerado
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    return json({
      ok: true,
      user_id: newUserId,
      temp_password: password,
      set_password_link: linkData?.properties?.action_link ?? null,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
