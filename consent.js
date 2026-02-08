(() => {
  // Speichern nur bei ACCEPT dauerhaft
  const KEY_ACCEPT = "site_consent_external_accept_v1";         // localStorage: "true"
  const KEY_REJECT_SESSION = "site_consent_external_reject_s1"; // sessionStorage: "true"
  const KEY_SCRIPTS_LOADED = "site_consent_external_scripts_loaded_v1"; // sessionStorage: "1"

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function isAccepted() {
    return localStorage.getItem(KEY_ACCEPT) === "true";
  }
  function isRejectedThisSession() {
    return sessionStorage.getItem(KEY_REJECT_SESSION) === "true";
  }

  // ---- Helpers: Gates aktualisieren, falls vorhanden ----
  function updateGatesIfPresent(){
    try { window.updateEmbedGates?.(); } catch(e) {}
  }

  // ---- Activators (run AFTER accept) ----
  function activateLinks(){
    $$('link[data-consent-link="external"][data-href]').forEach(l => {
      const href = l.getAttribute("href");
      const dh = l.getAttribute("data-href");
      if (!href && dh) l.setAttribute("href", dh);
    });
  }

  function activateIframes(){
    $$("iframe[data-src]").forEach(ifr => {
      const ds = ifr.getAttribute("data-src");
      if (!ds) return;

      // Immer dann setzen, wenn src fehlt
      if (!ifr.getAttribute("src")) {
        ifr.setAttribute("src", ds);
        return;
      }

      // Optional: wenn ein reload gewünscht ist
      if (ifr.getAttribute("data-reload-after-consent") === "true") {
        // Force reload
        ifr.removeAttribute("src");
        ifr.setAttribute("src", ds);
      }
    });
  }

  function activateScripts(){
    // Diese Placeholder-Scripts existieren im DOM nur bis zum ersten Accept.
    // Damit wir nicht mehrfach nachladen (z.B. Consent.open mehrfach), setzen wir ein Session-Flag.
    const alreadyLoaded = sessionStorage.getItem(KEY_SCRIPTS_LOADED) === "1";

    const placeholders = $$('script[type="text/plain"][data-consent-script="external"][data-src]');
    if (!placeholders.length) {
      // Keine placeholders mehr vorhanden (z.B. weil schon ersetzt)
      // Wenn bereits geladen: ok. Wenn nicht: auch ok, da dann nichts zu tun.
      return;
    }

    if (alreadyLoaded) {
      // Placeholders sind noch da, aber wir haben sie in dieser Session schon geladen.
      // Dann lassen wir sie in Ruhe, um keine Doppel-Skripte zu erzeugen.
      // (Nach einem Reload sind die Placeholders wieder "frisch", Flag bleibt aber sessionweit.
      //  Deshalb setzen wir das Flag bei Reset zurück.)
      return;
    }

    placeholders.forEach(ph => {
      const src = ph.getAttribute("data-src");
      if (!src) return;

      const s = document.createElement("script");
      s.src = src;
      s.async = true;

      if (ph.hasAttribute("crossorigin")) s.setAttribute("crossorigin", ph.getAttribute("crossorigin"));
      if (ph.hasAttribute("referrerpolicy")) s.setAttribute("referrerpolicy", ph.getAttribute("referrerpolicy"));

      // Nach Scriptload: iFrames, die auf Setup angewiesen sind (Mirror), nachladen
      s.onload = () => {
        $$('iframe[data-reload-after-consent="true"]').forEach(ifr => {
          const ds = ifr.getAttribute("data-src");
          if (!ds) return;
          // Force reload (damit Setup greift)
          ifr.removeAttribute("src");
          ifr.setAttribute("src", ds);
        });
      };

      ph.replaceWith(s);
    });

    sessionStorage.setItem(KEY_SCRIPTS_LOADED, "1");
  }

  function activateExternalEverything(){
    activateLinks();
    activateScripts();
    activateIframes();
    updateGatesIfPresent();
  }

  // ---- Reset: macht die Seite wieder in den "vor Consent" Zustand ----
  function resetExternalState(){
    // Consent-Entscheidung löschen
    localStorage.removeItem(KEY_ACCEPT);
    sessionStorage.removeItem(KEY_REJECT_SESSION);

    // Script-Loaded Flag löschen (sonst lädt nach Reload ggf. nichts)
    sessionStorage.removeItem(KEY_SCRIPTS_LOADED);

    // Optional: iFrames "entladen" (falls du reset ohne reload willst)
    $$("iframe").forEach(ifr => {
      const src = ifr.getAttribute("src");
      const ds = ifr.getAttribute("data-src");

      // Wenn src gesetzt ist und data-src fehlt: sichern
      if (src && !ds) ifr.setAttribute("data-src", src);

      // src weg, damit sie wieder gated sind
      ifr.removeAttribute("src");
    });

    // Links wieder sperren (href entfernen)
    $$('link[data-consent-link="external"]').forEach(l => {
      // Falls href existiert und data-href fehlt: sichern
      const href = l.getAttribute("href");
      const dh = l.getAttribute("data-href");
      if (href && !dh) l.setAttribute("data-href", href);

      l.removeAttribute("href");
    });

    updateGatesIfPresent();
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
        updateGatesIfPresent();
        return;
      }

      if (action === "reset") {
        resetExternalState();
        // Du wolltest explizit Reload: dann ist alles garantiert "frisch"
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
      resetExternalState();
      location.reload();
    },
    open: () => showBanner(),
    // optional: falls du mal direkt accepten willst (z.B. "Inhalt anzeigen" Button)
    accept: () => {
      localStorage.setItem(KEY_ACCEPT, "true");
      sessionStorage.removeItem(KEY_REJECT_SESSION);
      $("#cookieBanner")?.remove();
      activateExternalEverything();
    },
    reject: () => {
      sessionStorage.setItem(KEY_REJECT_SESSION, "true");
      $("#cookieBanner")?.remove();
      updateGatesIfPresent();
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (isAccepted()) {
      // ✅ schon akzeptiert => direkt alles laden
      activateExternalEverything();
      return;
    }

    // Wenn in dieser Session schon abgelehnt wurde: nicht nerven, aber auch NICHT laden
    if (isRejectedThisSession()) {
      updateGatesIfPresent();
      return;
    }

    // Sonst: beim ersten Besuch/Session fragen
    showBanner();
    updateGatesIfPresent();
  });
})();
