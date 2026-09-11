/* A ORDEM — interações genéricas do front (menu, carrosséis).
   Conteúdo, progresso e login são dados reais via Supabase — ver
   supabase-client.js / auth-guard.js / site-content.js e o script de cada
   página. Este arquivo só cuida de UI que não depende de dados assíncronos. */
(function () {
  "use strict";

  /* ---- Menu mobile ---------------------------------------------------- */
  function initBurgerMenu() {
    var burger = document.querySelector(".nav__burger");
    var links = document.querySelector(".nav__links");
    if (burger && links && !burger.dataset.bound) {
      burger.dataset.bound = "1";
      burger.addEventListener("click", function () {
        links.classList.toggle("is-open");
      });
    }
  }

  /* ---- Carrosséis (setas prev/next) — chame de novo após injetar cards */
  function initRails() {
    document.querySelectorAll(".rail").forEach(function (rail) {
      var track = rail.querySelector(".rail__track");
      if (!track) return;
      var step = function () { return Math.round(track.clientWidth * 0.8); };
      var prev = rail.querySelector(".rail__arrow--prev");
      var next = rail.querySelector(".rail__arrow--next");
      if (prev && !prev.dataset.bound) {
        prev.dataset.bound = "1";
        prev.addEventListener("click", function () { track.scrollBy({ left: -step(), behavior: "smooth" }); });
      }
      if (next && !next.dataset.bound) {
        next.dataset.bound = "1";
        next.addEventListener("click", function () { track.scrollBy({ left: step(), behavior: "smooth" }); });
      }
    });
  }

  /* ---- Carrossel de banners do hero ---------------------------------
     slides: [{tag,title,text,bg}, ...] — vem do site_content (Supabase) */
  function initHero(slides) {
    var hero = document.querySelector(".hero");
    if (!hero || !slides || !slides.length) return;
    var dotsWrap = hero.querySelector(".hero__dots");
    var bg = hero.querySelector(".hero__bg");
    var tag = hero.querySelector(".hero__tag");
    var h1 = hero.querySelector("h1");
    var p = hero.querySelector("p");
    var i = 0, timer;
    function render(n) {
      var s = slides[n];
      if (!s) return;
      if (bg && s.bg) bg.style.backgroundImage = "url('" + s.bg + "')";
      if (tag) tag.textContent = s.tag || "";
      if (h1) h1.textContent = s.title || "";
      if (p) p.textContent = s.text || "";
      if (dotsWrap) dotsWrap.querySelectorAll("button").forEach(function (b, k) {
        b.classList.toggle("is-active", k === n);
      });
    }
    function go(n) { i = (n + slides.length) % slides.length; render(i); restart(); }
    function restart() { clearInterval(timer); timer = setInterval(function () { go(i + 1); }, 6000); }
    if (dotsWrap) {
      dotsWrap.innerHTML = "";
      slides.forEach(function (_, k) {
        var b = document.createElement("button");
        b.addEventListener("click", function () { go(k); });
        dotsWrap.appendChild(b);
      });
    }
    render(0);
    restart();
  }

  /* ---- Abas genéricas (usado em aula.html) --------------------------- */
  function initTabs() {
    document.querySelectorAll(".tabs button").forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", function () {
        var target = btn.getAttribute("data-tab");
        var tabsWrap = btn.closest(".tabs");
        tabsWrap.querySelectorAll("button").forEach(function (b) { b.classList.remove("is-active"); });
        document.querySelectorAll(".tab-panel").forEach(function (pnl) { pnl.classList.remove("is-active"); });
        btn.classList.add("is-active");
        var pnl = document.getElementById("tab-" + target);
        if (pnl) pnl.classList.add("is-active");
      });
    });
  }

  /* ---- Modal de post (mentoria/sinal) — vídeo ou só texto ------------ */
  function openPostModal(post) {
    var overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    var box = document.createElement("div");
    box.className = "modal-box";
    var closeBtn = document.createElement("button");
    closeBtn.className = "modal-close";
    closeBtn.setAttribute("aria-label", "Fechar");
    closeBtn.textContent = "✕";
    var h3 = document.createElement("h3");
    h3.textContent = post.title || "";
    box.appendChild(closeBtn);
    box.appendChild(h3);
    if (post.video_id) {
      var slot = document.createElement("div");
      box.appendChild(slot);
      if (window.AordemPlayer) window.AordemPlayer.mount(slot, post.video_id);
    }
    if (post.body) {
      var p = document.createElement("p");
      p.style.cssText = "color:var(--text-dim);font-size:13.5px;line-height:1.7;margin-top:14px;white-space:pre-wrap";
      p.textContent = post.body;
      box.appendChild(p);
    }
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    function close() { overlay.remove(); }
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    closeBtn.addEventListener("click", close);
  }

  initBurgerMenu();
  initRails();
  initTabs();

  window.Aordem = {
    initBurgerMenu: initBurgerMenu,
    initRails: initRails,
    initHero: initHero,
    initTabs: initTabs,
    openPostModal: openPostModal,
  };
})();
