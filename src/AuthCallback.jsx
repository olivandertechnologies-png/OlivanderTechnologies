import React, { useEffect } from "react";
import {
  ensureUserBootstrap,
  syncGoogleProviderSession,
} from "./dataLayer.js";
import { navigate } from "./router.js";
import { supabase } from "./supabase.js";

const palette = {
  page: "#080c14",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.35)",
};

function AuthCallback() {
  useEffect(() => {
    let isMounted = true;

    const handleCallback = async () => {
      let timeoutId;

      try {
        const hash = window.location.hash;
        const hasSessionHash =
          hash.includes("access_token") || hash.includes("refresh_token");
        const authCode = new URLSearchParams(window.location.search).get("code");
        const sessionPromise = (async () => {
          if (authCode) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
            if (error) {
              throw error;
            }

            if (data.session) {
              return data.session;
            }
          }

          const { data } = await supabase.auth.getSession();
          return data.session ?? null;
        })();
        const timeoutPromise = new Promise((resolve) => {
          timeoutId = window.setTimeout(() => {
            resolve({ timedOut: true });
          }, 5000);
        });
        const sessionResult = await Promise.race([sessionPromise, timeoutPromise]);

        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        if (!isMounted) {
          return;
        }

        if (sessionResult?.timedOut) {
          navigate("/?error=timeout", { replace: true });
          return;
        }

        const session = sessionResult;
        if (session?.user) {
          await ensureUserBootstrap(session.user);

          try {
            await syncGoogleProviderSession(session);
          } catch (error) {
            console.error("Failed to sync Google provider session", error);
          }

          if (!isMounted) {
            return;
          }

          const { data: userRow, error: userRowError } = await supabase
            .from("users")
            .select("onboarding_complete")
            .eq("id", session.user.id)
            .maybeSingle();

          if (userRowError) {
            throw userRowError;
          }

          if (!isMounted) {
            return;
          }

          navigate(userRow?.onboarding_complete === true ? "/dashboard" : "/onboarding", {
            replace: true,
          });
          return;
        }

        if (hasSessionHash) {
          navigate("/dashboard", { replace: true });
          return;
        }

        navigate("/", { replace: true });
      } catch (error) {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        console.error("Failed to complete auth callback", error);

        if (!isMounted) {
          return;
        }

        window.setTimeout(() => {
          navigate("/", { replace: true });
        }, 1200);
      }
    };

    void handleCallback();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: palette.page,
        color: palette.text,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <style>
        {`
          @keyframes olivander-auth-dot {
            0%, 80%, 100% { opacity: 0.2; }
            40% { opacity: 1; }
          }
        `}
      </style>
      <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.04em" }}>
        Olivander
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginTop: "18px",
        }}
      >
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            aria-hidden="true"
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "999px",
              backgroundColor: "rgba(255,255,255,0.4)",
              animation: "olivander-auth-dot 1.2s ease-in-out infinite",
              animationDelay: `${index * 200}ms`,
            }}
          />
        ))}
      </div>
      <div
        style={{
          marginTop: "16px",
          color: palette.muted,
          fontSize: "14px",
        }}
      >
        Signing you in...
      </div>
    </div>
  );
}

export default AuthCallback;
