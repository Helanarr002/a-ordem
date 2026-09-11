/* A ORDEM — player protegido para vídeos do YouTube "não listado".
   Usa a IFrame Player API (não o embed cru), com controles próprios e um
   overlay transparente por cima do iframe que bloqueia o menu de botão
   direito (onde ficaria "Copiar URL do vídeo").

   Limite honesto: isso impede a cópia casual pelo botão direito, mas o ID
   do vídeo continua visível pra quem abrir o DevTools (código-fonte / aba de
   rede) — é o mesmo nível de proteção usado por área de membros comuns
   (Hotmart, Kiwify etc.), não é DRM. Pra DRM de verdade seria preciso um
   provedor pago (Bunny Stream, VdoCipher, Vimeo Pro).

   Uso:
     <div id="player-slot"></div>
     <script src="assets/video-player.js"></script>
     <script>AordemPlayer.mount(document.getElementById('player-slot'), 'VIDEO_ID');</script>
*/
(function () {
  "use strict";

  var apiPromise = null;
  function loadYouTubeAPI() {
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (resolve) {
      if (window.YT && window.YT.Player) { resolve(window.YT); return; }
      var prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (prevReady) prevReady();
        resolve(window.YT);
      };
      var tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    });
    return apiPromise;
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    var m = Math.floor(s / 60), sec = s % 60;
    return m + ":" + (sec < 10 ? "0" : "") + sec;
  }

  function extractVideoId(input) {
    if (!input) return "";
    var s = input.trim();
    var m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{6,})/);
    if (m) return m[1];
    return s; // já era só o ID
  }

  async function mount(container, videoIdOrUrl, opts) {
    opts = opts || {};
    var videoId = extractVideoId(videoIdOrUrl);
    container.classList.add("ap");
    container.innerHTML =
      '<div class="ap__box">' +
        '<div class="ap__frame"></div>' +
        '<div class="ap__overlay"><span class="ap__playicon">' +
          '<svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>' +
        "</span></div>" +
      "</div>" +
      '<div class="ap__controls">' +
        '<button class="ap__btn" data-ap="play" aria-label="Reproduzir/Pausar">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>' +
        "</button>" +
        '<span class="ap__time" data-ap="time">0:00 / 0:00</span>' +
        '<div class="ap__bar" data-ap="bar"><div class="ap__bar-fill" data-ap="fill"></div></div>' +
        '<button class="ap__btn" data-ap="mute" aria-label="Mudo">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M19 8a5 5 0 0 1 0 8"/></svg>' +
        "</button>" +
        '<button class="ap__btn" data-ap="full" aria-label="Tela cheia">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5"/></svg>' +
        "</button>" +
      "</div>";

    var frameEl = container.querySelector(".ap__frame");
    var overlay = container.querySelector(".ap__overlay");
    var box = container.querySelector(".ap__box");
    var playBtn = container.querySelector('[data-ap="play"]');
    var muteBtn = container.querySelector('[data-ap="mute"]');
    var fullBtn = container.querySelector('[data-ap="full"]');
    var bar = container.querySelector('[data-ap="bar"]');
    var fill = container.querySelector('[data-ap="fill"]');
    var timeLbl = container.querySelector('[data-ap="time"]');

    var YT = await loadYouTubeAPI();
    var player = null;
    var ready = false;

    await new Promise(function (resolve) {
      player = new YT.Player(frameEl, {
        videoId: videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: function () { ready = true; resolve(); },
          onStateChange: onState,
        },
      });
    });

    function onState(e) {
      var playing = e.data === YT.PlayerState.PLAYING;
      container.classList.toggle("is-playing", playing);
    }

    function togglePlay() {
      if (!ready) return;
      var state = player.getPlayerState();
      if (state === YT.PlayerState.PLAYING) player.pauseVideo();
      else player.playVideo();
    }

    overlay.addEventListener("click", togglePlay);
    overlay.addEventListener("contextmenu", function (e) { e.preventDefault(); return false; });
    container.addEventListener("contextmenu", function (e) { e.preventDefault(); return false; });

    playBtn.addEventListener("click", togglePlay);

    muteBtn.addEventListener("click", function () {
      if (!ready) return;
      if (player.isMuted()) player.unMute(); else player.mute();
      container.classList.toggle("is-muted", player.isMuted());
    });

    fullBtn.addEventListener("click", function () {
      if (box.requestFullscreen) box.requestFullscreen();
      else if (box.webkitRequestFullscreen) box.webkitRequestFullscreen();
    });

    bar.addEventListener("click", function (e) {
      if (!ready) return;
      var rect = bar.getBoundingClientRect();
      var pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      player.seekTo(player.getDuration() * pct, true);
    });

    setInterval(function () {
      if (!ready) return;
      var dur = player.getDuration() || 0;
      var cur = player.getCurrentTime() || 0;
      var pct = dur ? (cur / dur) * 100 : 0;
      fill.style.width = pct + "%";
      timeLbl.textContent = fmtTime(cur) + " / " + fmtTime(dur);
    }, 500);

    return player;
  }

  window.AordemPlayer = { mount: mount, extractVideoId: extractVideoId };
})();
