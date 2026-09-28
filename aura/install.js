export function detectInstallContext(navigatorObject = {}, matchMedia = () => ({ matches: false })) {
  const userAgent = String(navigatorObject.userAgent || "");
  const platform = String(navigatorObject.platform || "");
  const maxTouchPoints = Number(navigatorObject.maxTouchPoints || 0);
  const isIPadDesktopMode = platform === "MacIntel" && maxTouchPoints > 1;

  return {
    isIOS: /iPhone|iPad|iPod/i.test(userAgent) || isIPadDesktopMode,
    isAndroid: /Android/i.test(userAgent),
    isStandalone: navigatorObject.standalone === true || matchMedia("(display-mode: standalone)").matches
  };
}

export function initializeInstallPage({ windowObject = window, documentObject = document, navigatorObject = navigator } = {}) {
  const installButton = documentObject.querySelector("#install-button");
  const status = documentObject.querySelector("#install-status");
  const guideCards = [...documentObject.querySelectorAll("[data-platform-guide]")];
  const context = detectInstallContext(navigatorObject, windowObject.matchMedia.bind(windowObject));
  let deferredPrompt = null;

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const markRecommendedGuide = (platform) => {
    for (const card of guideCards) {
      const isMatch = card.dataset.platformGuide === platform;
      card.classList.toggle("is-recommended", isMatch);
      const matchLabel = card.querySelector(".guide-match");
      if (matchLabel) matchLabel.hidden = !isMatch;
    }
  };

  if (context.isIOS) {
    documentObject.documentElement.dataset.platform = "ios";
    markRecommendedGuide("ios");
    setStatus("På iPhone installerar du Aura via Dela-menyn i Safari. Guiden finns precis nedanför.");
  } else if (context.isAndroid) {
    documentObject.documentElement.dataset.platform = "android";
    markRecommendedGuide("android");
    setStatus("När webbläsaren är redo visas installationsknappen här. Android-guiden finns också nedanför.");
  }

  if (context.isStandalone) {
    if (installButton) installButton.hidden = true;
    setStatus("Aura är redan installerad på den här enheten.");
    documentObject.documentElement.dataset.installed = "true";
  }

  windowObject.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (!context.isStandalone && installButton) {
      installButton.hidden = false;
      installButton.disabled = false;
    }
    setStatus("Aura är redo att få en egen plats på hemskärmen.");
  });

  installButton?.addEventListener("click", async () => {
    if (!deferredPrompt) {
      documentObject.querySelector("#installationsguide")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    installButton.disabled = true;

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      installButton.hidden = true;
      if (choice?.outcome === "accepted") {
        setStatus("Klart — Aura väntar på hemskärmen.");
      } else {
        setStatus("Ingen fara. Du kan installera senare via webbläsarens meny.");
      }
    } catch {
      installButton.hidden = true;
      setStatus("Följ guiden nedan för att lägga Aura på hemskärmen.");
    } finally {
      installButton.disabled = false;
    }
  });

  windowObject.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    if (installButton) installButton.hidden = true;
    documentObject.documentElement.dataset.installed = "true";
    setStatus("Klart — Aura väntar på hemskärmen.");
  });

  if ("serviceWorker" in navigatorObject && windowObject.location.protocol !== "file:") {
    navigatorObject.serviceWorker.register("/sw.js").catch(() => {});
  }

  return { context };
}

if (typeof window !== "undefined" && typeof document !== "undefined" && typeof navigator !== "undefined") {
  initializeInstallPage();
}
