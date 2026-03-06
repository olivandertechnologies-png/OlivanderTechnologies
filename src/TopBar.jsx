import React, { useEffect, useState } from "react";
import { navigate, usePathname } from "./router.js";
import SettingsPanel from "./SettingsPanel.jsx";
import { useSettingsState } from "./settingsState.js";

const palette = {
  border: "rgba(255,255,255,0.06)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.5)",
  blue: "#4f8ef7",
};

function navLinkStyle(active) {
  return {
    color: active ? palette.text : palette.muted,
    fontSize: "14px",
    fontWeight: 500,
    textDecoration: "none",
    paddingBottom: "15px",
    borderBottom: active ? `2px solid ${palette.blue}` : "2px solid transparent",
    lineHeight: 1,
  };
}

function TopBar() {
  const pathname = usePathname();
  const { profile, initials } = useSettingsState();
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  useEffect(() => {
    const dmSansId = "olivander-font-dm-sans";

    if (!document.getElementById(dmSansId)) {
      const dmSansLink = document.createElement("link");
      dmSansLink.id = dmSansId;
      dmSansLink.rel = "stylesheet";
      dmSansLink.href =
        "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap";
      document.head.appendChild(dmSansLink);
    }
  }, []);

  const handleNavigate = (event, path) => {
    event.preventDefault();
    setIsPanelOpen(false);
    navigate(path);
  };

  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          width: "100%",
          height: "52px",
          borderBottom: `1px solid ${palette.border}`,
          background: "rgba(8,12,20,0.88)",
          backdropFilter: "blur(20px)",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "52px",
            padding: "0 40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          <a
            href="/"
            onClick={(event) => handleNavigate(event, "/")}
            style={{
              color: palette.text,
              textDecoration: "none",
              fontSize: "16px",
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Olivander
          </a>

          <nav
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              display: "flex",
              alignItems: "center",
              gap: "32px",
              height: "52px",
            }}
          >
            <a
              href="/dashboard"
              onClick={(event) => handleNavigate(event, "/dashboard")}
              style={navLinkStyle(pathname === "/dashboard")}
            >
              Dashboard
            </a>
            <a
              href="/clients"
              onClick={(event) => handleNavigate(event, "/clients")}
              style={navLinkStyle(pathname === "/clients")}
            >
              Clients
            </a>
          </nav>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", height: "52px" }}>
            <div
              style={{
                color: palette.muted,
                fontSize: "12px",
                fontWeight: 500,
              }}
            >
              Last checked 2 min ago
            </div>

            <button
              type="button"
              aria-label="Open settings"
              onClick={() => setIsPanelOpen(true)}
              style={{
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "999px",
                backgroundColor: "#1a2035",
                color: palette.text,
                fontSize: "13px",
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {initials}
            </button>

            <div
              style={{
                color: palette.text,
                fontSize: "14px",
                fontWeight: 500,
              }}
            >
              {profile.name}
            </div>
          </div>
        </div>
      </header>

      <SettingsPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </>
  );
}

export default TopBar;
