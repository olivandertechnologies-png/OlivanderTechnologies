import React, { useEffect, useState } from "react";
import { navigate } from "./router.js";
import { supabase } from "./supabase.js";

const palette = {
  page: "#080c14",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.45)",
};

function AuthCallback() {
  const [message, setMessage] = useState("Signing you in...");

  useEffect(() => {
    let isMounted = true;

    const handleCallback = async () => {
      try {
        const hash = window.location.hash;
        const hasSessionHash =
          hash.includes("access_token") || hash.includes("refresh_token");

        const { data } = await supabase.auth.getSession();

        if (!isMounted) {
          return;
        }

        if (data.session || hasSessionHash) {
          navigate("/dashboard", { replace: true });
          return;
        }

        navigate("/", { replace: true });
      } catch (error) {
        console.error("Failed to complete auth callback", error);

        if (!isMounted) {
          return;
        }

        setMessage("Something went wrong. Try refreshing.");
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
      <div style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.04em" }}>
        Olivander
      </div>
      <div
        style={{
          marginTop: "12px",
          color: palette.muted,
          fontSize: "14px",
        }}
      >
        {message}
      </div>
    </div>
  );
}

export default AuthCallback;
