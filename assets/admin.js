/* A ORDEM — painel admin. Edita site_content, modules, lessons, posts e
   usuários/licenças. Só roda se o usuário logado tiver role='admin' — a
   guarda em auth-guard.js já bloqueia (e a RLS no banco bloqueia de novo,
   então nada aqui depende só de checagem no navegador). */
(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toast(msg, isError) {
    var el = document.createElement("div");
    el.className = "toast" + (isError ? " is-error" : "");
    el.textContent = msg;
    document.querySelector("[data-toast-slot]").appendChild(el);
    setTimeout(function () { el.remove(); }, 4200);
  }

  function extractVideoId(input) {
    if (!input) return "";
    var s = input.trim();
    var m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : s;
  }

  async function uploadMedia(file, folder) {
    if (!file) return null;
    var path = folder + "/" + Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9.]+/g, "-");
    var up = await window.sb.storage.from("media").upload(path, file, { upsert: true });
    if (up.error) { toast("Upload falhou: " + up.error.message, true); return null; }
    var pub = window.sb.storage.from("media").getPublicUrl(path);
    return pub.data.publicUrl;
  }

  async function getContent(key) {
    var r = await window.sb.from("site_content").select("data").eq("key", key).single();
    return (r.data && r.data.data) || {};
  }
  async function setContent(key, data) {
    var r = await window.sb.from("site_content").upsert({ key: key, data: data, updated_at: new Date().toISOString() });
    if (r.error) { toast("Erro ao salvar: " + r.error.message, true); return false; }
    toast("Salvo.");
    return true;
  }

  function formToObject(form) {
    var out = {};
    $all("input,textarea,select", form).forEach(function (el) {
      if (!el.name) return;
      if (el.type === "number") out[el.name] = el.value === "" ? 0 : Number(el.value);
      else if (el.type === "file") return;
      else out[el.name] = el.value;
    });
    return out;
  }
  function fillForm(form, data) {
    $all("input,textarea,select", form).forEach(function (el) {
      if (!el.name || el.type === "file") return;
      if (data[el.name] !== undefined && data[el.name] !== null) el.value = data[el.name];
      else el.value = el.tagName === "SELECT" ? el.options[0].value : "";
    });
  }

  /* ---- editor genérico de arrays (banners, faq, highlights, materiais) - */
  function renderArrayEditor(container, arr, fields) {
    container.innerHTML = "";
    container.style.display = "grid";
    container.style.gap = "10px";
    arr.forEach(function (item, idx) {
      var box = document.createElement("div");
      box.className = "admin-form";
      box.style.cssText = "border:1px solid var(--border);border-radius:11px;padding:14px;margin:0";
      fields.forEach(function (f) {
        var label = document.createElement("label");
        label.textContent = f.label;
        var input = f.type === "textarea" ? document.createElement("textarea") : document.createElement("input");
        input.value = item[f.key] || "";
        input.addEventListener("input", function () { item[f.key] = input.value; });
        box.appendChild(label);
        box.appendChild(input);
      });
      var rm = document.createElement("button");
      rm.type = "button"; rm.className = "btn btn--ghost btn--sm"; rm.textContent = "Remover";
      rm.addEventListener("click", function () { arr.splice(idx, 1); renderArrayEditor(container, arr, fields); });
      box.appendChild(rm);
      container.appendChild(box);
    });
  }

  /* ============================================================
     PAINÉIS
     ============================================================ */

  function initTabs() {
    $all(".admin__side button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        $all(".admin__side button").forEach(function (b) { b.classList.remove("is-active"); });
        $all(".admin-panel").forEach(function (p) { p.classList.remove("is-active"); });
        btn.classList.add("is-active");
        $('[data-panel-content="' + btn.dataset.panel + '"]').classList.add("is-active");
      });
    });
  }

  async function initInicio() {
    var brand = await getContent("brand");
    fillForm($('[data-form="brand"]'), brand);
    $('[data-form="brand"]').addEventListener("submit", async function (e) {
      e.preventDefault();
      await setContent("brand", Object.assign(brand, formToObject(this)));
    });

    var slides = await getContent("hero_slides");
    slides = Array.isArray(slides) ? slides : [];
    var editor = $('[data-editor="hero_slides"]');
    var fields = [
      { key: "tag", label: "Tag" },
      { key: "title", label: "Título" },
      { key: "text", label: "Texto", type: "textarea" },
      { key: "bg", label: "Imagem de fundo (URL)" },
    ];
    renderArrayEditor(editor, slides, fields);
    $('[data-add="hero_slides"]').addEventListener("click", function () {
      slides.push({ tag: "", title: "", text: "", bg: "" });
      renderArrayEditor(editor, slides, fields);
    });
    $('[data-save="hero_slides"]').addEventListener("click", async function () {
      await setContent("hero_slides", slides);
    });
  }

  async function initDesign() {
    var tokens = await getContent("design_tokens");
    fillForm($('[data-form="design_tokens"]'), tokens);
    $('[data-form="design_tokens"]').addEventListener("submit", async function (e) {
      e.preventDefault();
      var data = Object.assign(tokens, formToObject(this));
      var ok = await setContent("design_tokens", data);
      if (ok && window.SiteContent) SiteContent.applyDesignTokens(data);
    });
  }

  async function initLanding() {
    var landing = await getContent("landing");
    var landingForm = $('[data-form="landing"]');
    fillForm(landingForm, landing);
    landingForm.querySelector('[data-upload-for="hero_image"]').addEventListener("change", async function (e) {
      var url = await uploadMedia(e.target.files[0], "landing");
      if (url) landingForm.querySelector('[name="hero_image"]').value = url;
    });
    landingForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      Object.assign(landing, formToObject(this));
      await setContent("landing", landing);
    });

    var highlights = Array.isArray(landing.highlights) ? landing.highlights : [];
    landing.highlights = highlights;
    var hEditor = $('[data-editor="landing_highlights"]');
    var hFields = [{ key: "title", label: "Título" }, { key: "text", label: "Texto", type: "textarea" }];
    renderArrayEditor(hEditor, highlights, hFields);
    $('[data-add="landing_highlights"]').addEventListener("click", function () {
      highlights.push({ title: "", text: "" });
      renderArrayEditor(hEditor, highlights, hFields);
    });
    $('[data-save="landing_highlights"]').addEventListener("click", async function () {
      await setContent("landing", landing);
    });

    var stats = Array.isArray(landing.stats) ? landing.stats : [];
    landing.stats = stats;
    var sEditor = $('[data-editor="landing_stats"]');
    var sFields = [{ key: "value", label: "Número (ex: 8+)" }, { key: "label", label: "Legenda (ex: anos de mercado)" }];
    renderArrayEditor(sEditor, stats, sFields);
    $('[data-add="landing_stats"]').addEventListener("click", function () {
      stats.push({ value: "", label: "" });
      renderArrayEditor(sEditor, stats, sFields);
    });
    $('[data-save="landing_stats"]').addEventListener("click", async function () {
      await setContent("landing", landing);
    });

    var aboutForm = $('[data-form="landing_about"]');
    landing.about = landing.about || {};
    fillForm(aboutForm, landing.about);
    aboutForm.querySelector('[data-upload-for="image_url"]').addEventListener("change", async function (e) {
      var url = await uploadMedia(e.target.files[0], "landing");
      if (url) aboutForm.querySelector('[name="image_url"]').value = url;
    });
    aboutForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      Object.assign(landing.about, formToObject(this));
      await setContent("landing", landing);
    });

    var testimonials = Array.isArray(landing.testimonials) ? landing.testimonials : [];
    landing.testimonials = testimonials;
    var tEditor = $('[data-editor="landing_testimonials"]');
    var tFields = [{ key: "name", label: "Nome" }, { key: "role", label: "Cidade/ocupação (opcional)" }, { key: "text", label: "Depoimento", type: "textarea" }];
    renderArrayEditor(tEditor, testimonials, tFields);
    $('[data-add="landing_testimonials"]').addEventListener("click", function () {
      testimonials.push({ name: "", role: "", text: "" });
      renderArrayEditor(tEditor, testimonials, tFields);
    });
    $('[data-save="landing_testimonials"]').addEventListener("click", async function () {
      await setContent("landing", landing);
    });

    var pricingForm = $('[data-form="landing_pricing"]');
    landing.pricing = landing.pricing || {};
    fillForm(pricingForm, landing.pricing);
    pricingForm.querySelector('[name="features_text"]').value = (landing.pricing.features || []).join("\n");
    pricingForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var data = formToObject(this);
      var featuresText = data.features_text || "";
      delete data.features_text;
      data.features = featuresText.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      Object.assign(landing.pricing, data);
      await setContent("landing", landing);
    });
  }

  async function initComunidade() {
    var data = await getContent("comunidade");
    fillForm($('[data-form="comunidade"]'), data);
    $('[data-form="comunidade"]').addEventListener("submit", async function (e) {
      e.preventDefault();
      await setContent("comunidade", Object.assign(data, formToObject(this)));
    });
  }

  async function initSuporte() {
    var data = await getContent("suporte");
    fillForm($('[data-form="suporte"]'), data);
    $('[data-form="suporte"]').addEventListener("submit", async function (e) {
      e.preventDefault();
      Object.assign(data, formToObject(this));
      await setContent("suporte", data);
    });

    var faq = Array.isArray(data.faq) ? data.faq : [];
    data.faq = faq;
    var editor = $('[data-editor="suporte_faq"]');
    var fields = [{ key: "q", label: "Pergunta" }, { key: "a", label: "Resposta", type: "textarea" }];
    renderArrayEditor(editor, faq, fields);
    $('[data-add="suporte_faq"]').addEventListener("click", function () {
      faq.push({ q: "", a: "" });
      renderArrayEditor(editor, faq, fields);
    });
    $('[data-save="suporte_faq"]').addEventListener("click", async function () {
      await setContent("suporte", data);
    });
  }

  async function initLoginPanel() {
    var data = await getContent("login");
    fillForm($('[data-form="login"]'), data);
    $('[data-form="login"]').addEventListener("submit", async function (e) {
      e.preventDefault();
      Object.assign(data, formToObject(this));
      await setContent("login", data);
    });

    var badges = Array.isArray(data.badges) ? data.badges : [];
    data.badges = badges;
    var editor = $('[data-editor="login_badges"]');
    var fields = [{ key: "value", label: "Número (ex: 8)" }, { key: "label", label: "Legenda (ex: módulos)" }];
    renderArrayEditor(editor, badges, fields);
    $('[data-add="login_badges"]').addEventListener("click", function () {
      badges.push({ value: "", label: "" });
      renderArrayEditor(editor, badges, fields);
    });
    $('[data-save="login_badges"]').addEventListener("click", async function () {
      await setContent("login", data);
    });
  }

  /* ---- CURSOS: módulos + aulas ------------------------------------- */
  async function initCursos() {
    var moduleForm = $('[data-form="module"]');
    var lessonForm = $('[data-form="lesson"]');
    var currentModuleId = null;
    var lessonMaterials = [];

    async function loadModules() {
      var resp = await window.sb.from("modules").select("*").order("order_index");
      var list = $('[data-list="modules"]');
      list.innerHTML = "";
      (resp.data || []).forEach(function (mod) {
        var row = document.createElement("div");
        row.className = "admin-row";
        row.innerHTML =
          (mod.cover_image_url ? '<img class="thumb" src="' + mod.cover_image_url + '">' : '<span class="thumb" style="display:grid;place-items:center;font-size:10px;color:var(--text-mute)">sem capa</span>') +
          '<div class="grow"><b>' + escapeHtml(mod.title) + '</b><span>ordem ' + mod.order_index + " · " + (mod.published ? "publicado" : "rascunho") + '</span></div>' +
          '<div class="actions"><button class="btn btn--sm" data-edit>Editar / Aulas</button><button class="btn btn--sm btn--ghost" data-del>Excluir</button></div>';
        row.querySelector("[data-edit]").addEventListener("click", function () { openModule(mod); });
        row.querySelector("[data-del]").addEventListener("click", async function () {
          if (!confirm('Excluir o módulo "' + mod.title + '" e todas as aulas dele?')) return;
          await window.sb.from("modules").delete().eq("id", mod.id);
          toast("Módulo excluído.");
          loadModules();
          if (currentModuleId === mod.id) { currentModuleId = null; $("[data-lessons-section]").style.display = "none"; }
        });
        list.appendChild(row);
      });
    }

    function openModule(mod) {
      moduleForm.style.display = "";
      fillForm(moduleForm, mod);
      moduleForm.querySelector('select[name="published"]').value = String(mod.published !== false);
      currentModuleId = mod.id;
      $("[data-lessons-section]").style.display = "";
      $("[data-current-module-title]").textContent = mod.title;
      loadLessons();
    }

    $('[data-new="module"]').addEventListener("click", function () {
      moduleForm.style.display = "";
      fillForm(moduleForm, { id: "", title: "", description: "", order_index: 0, published: "true", cover_image_url: "" });
      currentModuleId = null;
      $("[data-lessons-section]").style.display = "none";
    });
    $("[data-cancel-module]").addEventListener("click", function () { moduleForm.style.display = "none"; });

    $('[data-upload-for="cover_image_url"]', moduleForm).addEventListener("change", async function (e) {
      var url = await uploadMedia(e.target.files[0], "covers");
      if (url) moduleForm.querySelector('[name="cover_image_url"]').value = url;
    });

    moduleForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var data = formToObject(this);
      data.published = data.published === "true";
      var id = data.id; delete data.id;
      if (!data.slug) data.slug = (data.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      var resp = id
        ? await window.sb.from("modules").update(data).eq("id", id)
        : await window.sb.from("modules").insert(data);
      if (resp.error) { toast("Erro: " + resp.error.message, true); return; }
      toast("Módulo salvo.");
      loadModules();
    });

    async function loadLessons() {
      if (!currentModuleId) return;
      var resp = await window.sb.from("lessons").select("*").eq("module_id", currentModuleId).order("order_index");
      var list = $('[data-list="lessons"]');
      list.innerHTML = "";
      (resp.data || []).forEach(function (lesson) {
        var row = document.createElement("div");
        row.className = "admin-row";
        row.innerHTML =
          '<div class="grow"><b>' + escapeHtml(lesson.title) + '</b><span>' + (lesson.duration_min || 0) + " min · " + (lesson.published ? "publicada" : "rascunho") + (lesson.video_id ? "" : " · sem vídeo") + '</span></div>' +
          '<div class="actions"><button class="btn btn--sm" data-edit>Editar</button><button class="btn btn--sm btn--ghost" data-del>Excluir</button></div>';
        row.querySelector("[data-edit]").addEventListener("click", function () { openLesson(lesson); });
        row.querySelector("[data-del]").addEventListener("click", async function () {
          if (!confirm('Excluir a aula "' + lesson.title + '"?')) return;
          await window.sb.from("lessons").delete().eq("id", lesson.id);
          toast("Aula excluída.");
          loadLessons();
        });
        list.appendChild(row);
      });
    }

    function lessonMaterialsFields() {
      return [{ key: "label", label: "Nome do material" }, { key: "url", label: "Link" }];
    }

    function openLesson(lesson) {
      lessonForm.style.display = "";
      fillForm(lessonForm, lesson);
      lessonForm.querySelector('select[name="published"]').value = String(lesson.published !== false);
      lessonMaterials = Array.isArray(lesson.materials) ? lesson.materials.slice() : [];
      renderArrayEditor($('[data-editor="lesson_materials"]'), lessonMaterials, lessonMaterialsFields());
    }

    $('[data-new="lesson"]').addEventListener("click", function () {
      lessonForm.style.display = "";
      fillForm(lessonForm, { id: "", title: "", description: "", video_id: "", duration_min: 0, order_index: 0, published: "true" });
      lessonMaterials = [];
      renderArrayEditor($('[data-editor="lesson_materials"]'), lessonMaterials, lessonMaterialsFields());
    });
    $("[data-cancel-lesson]").addEventListener("click", function () { lessonForm.style.display = "none"; });
    $('[data-add="lesson_materials"]').addEventListener("click", function () {
      lessonMaterials.push({ label: "", url: "" });
      renderArrayEditor($('[data-editor="lesson_materials"]'), lessonMaterials, lessonMaterialsFields());
    });

    lessonForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!currentModuleId) { toast("Selecione um módulo primeiro.", true); return; }
      var data = formToObject(this);
      data.published = data.published === "true";
      data.video_id = extractVideoId(data.video_id);
      data.materials = lessonMaterials;
      data.module_id = currentModuleId;
      var id = data.id; delete data.id;
      var resp = id
        ? await window.sb.from("lessons").update(data).eq("id", id)
        : await window.sb.from("lessons").insert(data);
      if (resp.error) { toast("Erro: " + resp.error.message, true); return; }
      toast("Aula salva.");
      loadLessons();
    });

    loadModules();
  }

  /* ---- MENTORIAS / SALA DE SINAIS (tabela posts, filtrada por tipo) -- */
  function initPostsPanel(type) {
    var listEl = $('[data-posts-list="' + type + '"]');
    var formWrap = $('[data-posts-form-wrap="' + type + '"]');

    function renderForm(post) {
      formWrap.innerHTML =
        '<form class="admin-form" style="margin-top:14px">' +
          '<input type="hidden" name="id" value="' + (post.id || "") + '">' +
          "<label>Título</label><input name=\"title\" required value=\"" + escapeHtml(post.title || "") + '">' +
          "<label>Texto</label><textarea name=\"body\">" + escapeHtml(post.body || "") + "</textarea>" +
          '<div class="row2">' +
            "<div><label>Categoria/data</label><input name=\"category\" value=\"" + escapeHtml(post.category || "") + '"></div>' +
            "<div><label>ID/URL do vídeo (opcional)</label><input name=\"video_id\" value=\"" + escapeHtml(post.video_id || "") + '"></div>' +
          "</div>" +
          '<div class="row2">' +
            "<div><label>Ordem</label><input name=\"order_index\" type=\"number\" value=\"" + (post.order_index || 0) + '"></div>' +
            '<div><label>Publicado</label><select name="published"><option value="true"' + (post.published !== false ? " selected" : "") + '>Sim</option><option value="false"' + (post.published === false ? " selected" : "") + ">Não</option></select></div>" +
          "</div>" +
          "<label>Imagem de capa</label><input type=\"file\" accept=\"image/*\" data-upload>" +
          "<input name=\"image_url\" placeholder=\"URL da imagem\" value=\"" + escapeHtml(post.image_url || "") + '">' +
          '<div style="display:flex;gap:10px"><button class="btn" type="submit">Salvar</button><button class="btn btn--ghost" type="button" data-cancel>Cancelar</button></div>' +
        "</form>";

      var form = formWrap.querySelector("form");
      form.querySelector("[data-upload]").addEventListener("change", async function (e) {
        var url = await uploadMedia(e.target.files[0], "posts");
        if (url) form.querySelector('[name="image_url"]').value = url;
      });
      form.querySelector("[data-cancel]").addEventListener("click", function () { formWrap.innerHTML = ""; });
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var data = formToObject(this);
        data.published = data.published === "true";
        data.video_id = data.video_id ? extractVideoId(data.video_id) : "";
        data.type = type;
        var id = data.id; delete data.id;
        var resp = id
          ? await window.sb.from("posts").update(data).eq("id", id)
          : await window.sb.from("posts").insert(data);
        if (resp.error) { toast("Erro: " + resp.error.message, true); return; }
        toast("Salvo.");
        formWrap.innerHTML = "";
        load();
      });
    }

    async function load() {
      var resp = await window.sb.from("posts").select("*").eq("type", type).order("order_index");
      listEl.innerHTML = "";
      (resp.data || []).forEach(function (post) {
        var row = document.createElement("div");
        row.className = "admin-row";
        row.innerHTML =
          (post.image_url ? '<img class="thumb" src="' + post.image_url + '">' : '<span class="thumb"></span>') +
          '<div class="grow"><b>' + escapeHtml(post.title) + '</b><span>' + escapeHtml(post.category || "") + '</span></div>' +
          '<div class="actions"><button class="btn btn--sm" data-edit>Editar</button><button class="btn btn--sm btn--ghost" data-del>Excluir</button></div>';
        row.querySelector("[data-edit]").addEventListener("click", function () { renderForm(post); });
        row.querySelector("[data-del]").addEventListener("click", async function () {
          if (!confirm('Excluir "' + post.title + '"?')) return;
          await window.sb.from("posts").delete().eq("id", post.id);
          load();
        });
        listEl.appendChild(row);
      });
    }

    $('[data-posts-new="' + type + '"]').addEventListener("click", function () { renderForm({}); });
    load();
  }

  /* ---- USUÁRIOS & LICENÇAS ------------------------------------------ */
  function initUsuarios() {
    var form = $('[data-form="user"]');

    $('[data-new="user"]').addEventListener("click", function () { form.style.display = ""; });
    $("[data-cancel-user]").addEventListener("click", function () { form.style.display = "none"; });

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var data = formToObject(this);
      var payload = {
        email: data.email,
        full_name: data.full_name,
        plan: data.plan || "padrao",
        expires_at: data.expires_at ? new Date(data.expires_at + "T23:59:59").toISOString() : null,
      };
      var resp = await window.sb.functions.invoke("admin-create-user", { body: payload });
      if (resp.error) { toast("Erro ao criar usuário: " + resp.error.message, true); return; }
      var result = resp.data;
      if (result && result.error) { toast("Erro: " + result.error, true); return; }
      toast("Usuário criado.");
      form.reset();
      form.style.display = "none";
      if (result && result.set_password_link) {
        alert("Usuário criado! Envie este link pro aluno definir a senha:\n\n" + result.set_password_link);
      }
      loadUsers();
    });

    async function loadUsers() {
      var resp = await window.sb.from("profiles").select("*, licenses(*)").order("created_at", { ascending: false });
      var list = $('[data-list="users"]');
      list.innerHTML = "";
      (resp.data || []).forEach(function (profile) {
        var licenses = (profile.licenses || []).slice().sort(function (a, b) { return new Date(b.created_at) - new Date(a.created_at); });
        var lic = licenses[0];
        var status = "sem licença", badgeClass = "badge--off";
        if (lic) {
          var expired = lic.expires_at && new Date(lic.expires_at) < new Date();
          if (lic.status === "revoked") { status = "revogada"; badgeClass = "badge--off"; }
          else if (expired) { status = "expirada"; badgeClass = "badge--warn"; }
          else { status = "ativa"; badgeClass = "badge--ok"; }
        }
        var row = document.createElement("div");
        row.className = "admin-row";
        row.innerHTML =
          '<div class="grow"><b>' + escapeHtml(profile.full_name || profile.email) + '</b>' +
          '<span>' + escapeHtml(profile.email) + (lic ? " · plano " + escapeHtml(lic.plan) : "") + '</span></div>' +
          '<span class="badge ' + badgeClass + '">' + status + '</span>' +
          '<input type="date" style="width:140px" value="' + (lic && lic.expires_at ? lic.expires_at.slice(0, 10) : "") + '" data-renew-input>' +
          '<div class="actions">' +
            '<button class="btn btn--sm" data-renew>Salvar validade</button>' +
            (lic && lic.status !== "revoked"
              ? '<button class="btn btn--sm btn--ghost" data-revoke>Revogar</button>'
              : '<button class="btn btn--sm btn--ghost" data-reactivate>Reativar</button>') +
            '<button class="btn btn--sm btn--ghost" data-reset>Reenviar senha</button>' +
          '</div>';

        if (lic) {
          row.querySelector("[data-renew]").addEventListener("click", async function () {
            var val = row.querySelector("[data-renew-input]").value;
            await window.sb.from("licenses").update({ expires_at: val ? new Date(val + "T23:59:59").toISOString() : null }).eq("id", lic.id);
            toast("Validade atualizada.");
            loadUsers();
          });
          var revokeBtn = row.querySelector("[data-revoke]");
          if (revokeBtn) revokeBtn.addEventListener("click", async function () {
            if (!confirm("Revogar o acesso de " + profile.email + "?")) return;
            await window.sb.from("licenses").update({ status: "revoked" }).eq("id", lic.id);
            toast("Acesso revogado.");
            loadUsers();
          });
          var reactivateBtn = row.querySelector("[data-reactivate]");
          if (reactivateBtn) reactivateBtn.addEventListener("click", async function () {
            await window.sb.from("licenses").update({ status: "active" }).eq("id", lic.id);
            toast("Acesso reativado.");
            loadUsers();
          });
        } else {
          row.querySelector("[data-renew]").style.display = "none";
        }
        row.querySelector("[data-reset]").addEventListener("click", async function () {
          await window.sb.auth.resetPasswordForEmail(profile.email);
          toast("E-mail de redefinição enviado (se o e-mail existir).");
        });

        list.appendChild(row);
      });
    }

    loadUsers();
  }

  /* ============================================================ */

  document.querySelector("[data-logout]").addEventListener("click", function (e) {
    e.preventDefault();
    AordemGuard.logout();
  });

  AordemGuard.requireAccess({ admin: true }).then(function () {
    initTabs();
    initInicio();
    initDesign();
    initLanding();
    initCursos();
    initComunidade();
    initPostsPanel("mentoria");
    initPostsPanel("sinal");
    initSuporte();
    initLoginPanel();
    initUsuarios();
  });
})();
