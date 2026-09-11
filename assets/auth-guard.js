/* A ORDEM — guarda de sessão/licença/admin.
   Uso: <script src="assets/supabase-client.js"></script>
        <script src="assets/auth-guard.js"></script>
        <script>AordemGuard.requireAccess({ admin:false }).then(function(ctx){ ...seu código... });</script>
   A página deve começar com `body{opacity:0}` inline (ou classe) — o guard
   revela o body só depois de confirmar acesso, senão redireciona antes. */
(function () {
  "use strict";

  function reveal() {
    document.documentElement.classList.add("aordem-ready");
  }

  function goLogin(reason) {
    var url = "login.html";
    if (reason) url += "?blocked=" + encodeURIComponent(reason);
    window.location.href = url;
  }

  async function requireAccess(opts) {
    opts = opts || {};
    if (!window.sb) { goLogin("config"); return Promise.reject("no-client"); }

    var sessionResp = await window.sb.auth.getSession();
    var session = sessionResp && sessionResp.data && sessionResp.data.session;
    if (!session) { goLogin(); return Promise.reject("no-session"); }

    var user = session.user;

    var profileResp = await window.sb.from("profiles").select("*").eq("id", user.id).single();
    var profile = profileResp.data;
    if (!profile) { goLogin("profile"); return Promise.reject("no-profile"); }

    if (opts.admin) {
      if (profile.role !== "admin") { window.location.href = "index.html"; return Promise.reject("not-admin"); }
      reveal();
      return { user: user, profile: profile, isAdmin: true };
    }

    if (profile.role === "admin") {
      reveal();
      return { user: user, profile: profile, isAdmin: true };
    }

    var accessResp = await window.sb.rpc("has_access");
    if (accessResp.error || !accessResp.data) { goLogin("license"); return Promise.reject("no-access"); }

    reveal();
    return { user: user, profile: profile, isAdmin: false };
  }

  async function logout() {
    if (window.sb) await window.sb.auth.signOut();
    window.location.href = "login.html";
  }

  window.AordemGuard = { requireAccess: requireAccess, logout: logout };
})();
