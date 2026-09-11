/* A ORDEM — client único do Supabase.
   Preencha com os dados do SEU projeto (Dashboard → Settings → API).
   A "anon key" é pública por design: quem protege os dados é a Row Level
   Security (RLS) no banco, não o segredo dessa chave. */
(function () {
  "use strict";

  var SUPABASE_URL = "https://yhulnfrrewzphdijwofb.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlodWxuZnJyZXd6cGhkaWp3b2ZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNDY4OTUsImV4cCI6MjEwNDcyMjg5NX0.IyMr_ahKnibHEr24pe4O6NLzMlOnt1QPar1t58WV1r4";

  if (!window.supabase) {
    console.error("supabase-js não carregou — confira o <script> do CDN antes deste arquivo.");
    return;
  }

  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  window.SB_CONFIGURED = SUPABASE_URL.indexOf("SEU-PROJETO") === -1;
  if (!window.SB_CONFIGURED) {
    console.warn("A ORDEM: configure assets/supabase-client.js com a URL e a anon key do seu projeto Supabase.");
  }
})();
