import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

/**
 * Deep link handler for native apps (iOS/Android)
 * Captures deep links and navigates to appropriate routes
 */
export function DeepLinkGate() {
  const navigate = useNavigate();
  const handledOnce = useRef<string | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const handleUrl = (url?: string) => {
      if (!url) return;

      // évite double-exécution (StrictMode + events)
      if (handledOnce.current === url) return;
      handledOnce.current = url;

      console.log('[DeepLinkGate] Handling deep link:', url);

      // ✅ reset password
      if (url.startsWith("lexu://reset-password")) {
        // stocker l'url (pour que ResetPasswordPage puisse init la session)
        sessionStorage.setItem("pending_deeplink", url);

        navigate("/reset-password", { replace: true });
        return;
      }

      // (optionnel) autres deeplinks...
    };

    (async () => {
      // ✅ Cold start
      const launch = await CapApp.getLaunchUrl();
      if (launch?.url) {
        handleUrl(launch.url);
      }

      // ✅ App déjà ouverte (background)
      const sub = CapApp.addListener("appUrlOpen", ({ url }) => handleUrl(url));

      return () => {
        sub.remove();
      };
    })();
  }, [navigate]);

  return null;
}

