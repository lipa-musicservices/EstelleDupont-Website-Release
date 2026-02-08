(() => {
  // Speichern nur bei ACCEPT dauerhaft
  const KEY_ACCEPT = "site_consent_external_accept_v1";        // localStorage: "true"
  const KEY_REJECT_SESSION = "site_consent_external_reject_s1"; // sessionStorage: "true"

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function isAccepted() {
    return localStorage.getItem(KEY_ACCEPT) === "true";
  }
  function isRejectedThisSession() {
    return sessionStorage.getItem(KEY_REJECT_SESSION) === "true";
  }

  // ---- Activators (run AFTER accept) ----
  function activateLinks(){
    $$('link[data-consent-link="external"][data-href]').forEach(l => {
      if (!l.getAttribute("href")) l.setAttribute("href", l.getAttribute("data-href"));
    });
  }

  function activateScripts(){
    $$('script[type="text/plain"][data-consent-script="external"][data-src]').forEach(ph => {
      const s = document.createElement("script");
      s.src = ph.getAttribute("data-src");
      if (ph.hasAttribute("crossorigin")) s.setAttribute("crossorigin", ph.getAttribute("crossorigin"));
      if (ph.hasAttribute("referrerpolicy")) s.setAttribute("referrerpolicy", ph.getAttribute("referrerpolicy"));

      s.onload = () => {
        // Falls iframeSetup erst nach Script verfügbar ist: IG iFrame dann nachladen
        $$('iframe[data-reload-after-consent="true"]').forEach(ifr => {
          if (ifr.getAttribute("src")) return;
          const ds = ifr.getAttribute("data-src");
          if (ds) ifr.setAttribute("src", ds);
        });
      };

      ph.replaceWith(s);
    });
  }

  function activateIframes(){
    $$("iframe[data-src]").forEach(ifr => {
      if (ifr.getAttribute("src")) return;
      const src = ifr.getAttribute("data-src");
      if (src) ifr.setAttribute("src", src);
    });
  }

  function activateExternalEverything(){
    activateLinks();
    activateScripts();
    activateIframes();
  }

  // ---- Banner UI ----
  function createBanner(){
    const wrap = document.createElement("div");
    wrap.id = "cookieBanner";
    wrap.innerHTML = `
      <div class="cb__card" role="dialog" aria-label="Cookie-Einstellungen" aria-live="polite">
        <div class="cb__title">Cookies & externe Inhalte</div>
        <div class="cb__text">
          Externe Inhalte (Instagram/YouTube/Spotify/Google Fonts) werden erst geladen,
          wenn du zustimmst.
        </div>

        <div class="cb__buttons">
          <button class="cb__btn" data-action="reject">Ablehnen</button>
          <button class="cb__btn cb__btn--primary" data-action="accept">Akzeptieren</button>
        </div>

        <div class="cb__fineprint">
          <a href="Datenschutz.html">Datenschutz</a>
          <span>·</span>
          <button class="cb__link" data-action="reset">Entscheidung zurücksetzen</button>
        </div>
      </div>
    `;

    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-action");

      if (action === "accept") {
        // ✅ dauerhaft speichern
        localStorage.setItem(KEY_ACCEPT, "true");
        // Session-Reject löschen (falls vorhanden)
        sessionStorage.removeItem(KEY_REJECT_SESSION);

        wrap.remove();
        activateExternalEverything();
        return;
      }

      if (action === "reject") {
        // ❌ NICHT dauerhaft speichern — nur für diese Session merken
        sessionStorage.setItem(KEY_REJECT_SESSION, "true");
        wrap.remove();
        return;
      }

      if (action === "reset") {
        localStorage.removeItem(KEY_ACCEPT);
        sessionStorage.removeItem(KEY_REJECT_SESSION);
        location.reload();
      }
    });

    return wrap;
  }

  function showBanner(){
    if ($("#cookieBanner")) return;
    document.body.appendChild(createBanner());
  }

  // Public API (Footer etc.)
  window.Consent = {
    accepted: () => isAccepted(),
    reset: () => {
      localStorage.removeItem(KEY_ACCEPT);
      sessionStorage.removeItem(KEY_REJECT_SESSION);
      location.reload();
    },
    open: () => showBanner()
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (isAccepted()) {
      // ✅ schon akzeptiert => direkt alles laden
      activateExternalEverything();
      return;
    }

    // Wenn in dieser Session schon abgelehnt wurde: nicht nerven, aber auch NICHT laden
    if (isRejectedThisSession()) return;

    // Sonst: beim ersten Besuch/Session fragen
    showBanner();
  });
})();
