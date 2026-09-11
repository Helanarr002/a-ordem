/* A ORDEM — aplica o conteúdo editável (site_content) nas páginas.
   Marque elementos com data-content="chave.campo" (ex: data-content="brand.name").
   Por padrão troca o textContent; com data-content-attr="src" troca o atributo
   informado (útil pra imagens/links) em vez do texto. */
(function () {
  "use strict";

  function resolvePath(byKey, path) {
    var parts = path.split(".");
    var key = parts.shift();
    var node = byKey[key];
    for (var i = 0; i < parts.length && node != null; i++) node = node[parts[i]];
    return node;
  }

  function applyContent(byKey, root) {
    (root || document).querySelectorAll("[data-content]").forEach(function (el) {
      var path = el.getAttribute("data-content");
      var val = resolvePath(byKey, path);
      if (val === undefined || val === null) return;
      var attr = el.getAttribute("data-content-attr");
      if (attr) el.setAttribute(attr, val);
      else el.textContent = val;
    });
  }

  function applyDesignTokens(tokens) {
    if (!tokens) return;
    var root = document.documentElement.style;
    if (tokens.accent) root.setProperty("--accent", tokens.accent);
    if (tokens.accent_bright) root.setProperty("--accent-bright", tokens.accent_bright);
    if (tokens.accent_magenta) root.setProperty("--accent-magenta", tokens.accent_magenta);
    if (tokens.bg_0) root.setProperty("--bg-0", tokens.bg_0);
    if (tokens.accent && tokens.accent_bright && tokens.accent_magenta) {
      var grad = "linear-gradient(115deg, " + tokens.accent + " 0%, " + tokens.accent_bright + " 55%, " + tokens.accent_magenta + " 100%)";
      root.setProperty("--accent-grad", grad);
    }
  }

  async function load(keys) {
    var byKey = {};
    if (!window.sb) return byKey;
    var resp = await window.sb.from("site_content").select("key,data").in("key", keys);
    (resp.data || []).forEach(function (row) { byKey[row.key] = row.data; });
    return byKey;
  }

  async function init(keys, root) {
    var byKey = await load(keys);
    applyContent(byKey, root);
    if (byKey.design_tokens) applyDesignTokens(byKey.design_tokens);
    return byKey;
  }

  window.SiteContent = { load: load, apply: applyContent, applyDesignTokens: applyDesignTokens, init: init };
})();
