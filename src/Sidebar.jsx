import React, { useEffect, useState } from "react";
import { fetchUserProfile, getInitials, saveUserProfile } from "./dataLayer.js";
import { navigate, usePathname } from "./router.js";
import SettingsPanel from "./SettingsPanel.jsx";
import { supabase } from "./supabase.js";

const palette = {
  page: "#080c14",
  border: "rgba(255,255,255,0.06)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.45)",
};

const EMPTY_SETTINGS = {
  profile: {
    name: "",
    businessName: "",
    work: "",
    signoff: "",
    turnaround: "",
  },
  behaviour: {
    tone: "Professional",
    followUpDelay: "After 3 days",
    autoDismissLowPriority: false,
  },
  integrations: {
    calendarConnected: false,
  },
};

function navLinkStyle(active) {
  return {
    width: "100%",
    padding: "9px 12px",
    borderRadius: "8px",
    color: active ? palette.text : palette.muted,
    backgroundColor: active ? "rgba(255,255,255,0.06)" : "transparent",
    textDecoration: "none",
    fontSize: "14px",
    fontWeight: 500,
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: "border-box",
    transition: "background-color 160ms ease, color 160ms ease",
  };
}

function Sidebar({ user }) {
  const pathname = usePathname();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!user) {
        return;
      }

      setLoadingProfile(true);
      setProfileError("");

      try {
        const nextSettings = await fetchUserProfile(user);
        if (isMounted) {
          setSettings(nextSettings);
        }
      } catch (error) {
        console.error("Failed to load user profile", error);
        if (isMounted) {
          setProfileError("Something went wrong. Try refreshing.");
        }
      } finally {
        if (isMounted) {
          setLoadingProfile(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleNavigate = (event, path) => {
    event.preventDefault();
    navigate(path);
  };

  const handleOpenSettings = async () => {
    setIsPanelOpen(true);
    setLoadingProfile(true);
    setProfileError("");

    try {
      const nextSettings = await fetchUserProfile(user);
      setSettings(nextSettings);
    } catch (error) {
      console.error("Failed to refresh settings profile", error);
      setProfileError("Something went wrong. Try refreshing.");
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleFieldChange = (section, field, value) => {
    setIsSaved(false);
    setSettings((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    if (!user || isSaving) {
      return;
    }

    setIsSaving(true);
    setProfileError("");

    try {
      const nextSettings = await saveUserProfile(user, settings);
      setSettings(nextSettings);
      setIsSaved(true);
      window.setTimeout(() => {
        setIsSaved(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to save user profile", error);
      setProfileError("Something went wrong. Try refreshing.");
      setIsSaved(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    setProfileError("");

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }

      navigate("/", { replace: true });
    } catch (error) {
      console.error("Failed to sign out", error);
      setProfileError("Something went wrong. Try refreshing.");
    } finally {
      setIsSigningOut(false);
      setIsPanelOpen(false);
    }
  };

  const name = settings.profile.name || user?.user_metadata?.full_name || user?.email || "User";
  const businessName = settings.profile.businessName || "Add your business name";
  const initials = getInitials(name) || "OL";

  return (
    <>
      <aside
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "220px",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          padding: "28px 20px",
          backgroundColor: palette.page,
          borderRight: `1px solid ${palette.border}`,
          boxSizing: "border-box",
          zIndex: 100,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <a
          href="/"
          onClick={(event) => handleNavigate(event, "/")}
          style={{
            marginBottom: "40px",
            color: palette.text,
            textDecoration: "none",
            fontSize: "16px",
            fontWeight: 600,
          }}
        >
          Olivander
        </a>

        <nav style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {[
            { label: "Dashboard", path: "/dashboard" },
            { label: "Clients", path: "/clients" },
          ].map((link) => {
            const active = pathname === link.path;
            const hovered = hoveredLink === link.path;

            return (
              <a
                key={link.path}
                href={link.path}
                onClick={(event) => handleNavigate(event, link.path)}
                onMouseEnter={() => setHoveredLink(link.path)}
                onMouseLeave={() =>
                  setHoveredLink((current) => (current === link.path ? null : current))
                }
                style={{
                  ...navLinkStyle(active),
                  backgroundColor: active
                    ? "rgba(255,255,255,0.06)"
                    : hovered
                      ? "rgba(255,255,255,0.04)"
                      : "transparent",
                }}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        <div style={{ flex: 1 }} />

        <div
          style={{
            paddingTop: "20px",
            borderTop: `1px solid ${palette.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <button
              type="button"
              aria-label="Open settings"
              onClick={handleOpenSettings}
              style={{
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "999px",
                border: "none",
                backgroundColor: "#1a2035",
                color: palette.text,
                fontSize: "13px",
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              {initials}
            </button>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: palette.text,
                  fontSize: "13px",
                  fontWeight: 500,
                  lineHeight: 1.3,
                }}
              >
                {loadingProfile ? "Loading..." : name}
              </div>
              <div
                style={{
                  color: palette.muted,
                  fontSize: "12px",
                  lineHeight: 1.3,
                }}
              >
                {loadingProfile ? "Fetching profile" : businessName}
              </div>
            </div>
          </div>

          {profileError ? (
            <div
              style={{
                marginTop: "12px",
                color: palette.muted,
                fontSize: "11px",
                lineHeight: 1.4,
              }}
            >
              {profileError}
            </div>
          ) : (
            <div
              style={{
                marginTop: "12px",
                color: palette.muted,
                fontSize: "11px",
                lineHeight: 1.4,
              }}
            >
              Last checked just now
            </div>
          )}
        </div>
      </aside>

      <SettingsPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        settings={settings}
        initials={initials}
        loading={loadingProfile}
        error={profileError}
        confirmClear={confirmClear}
        setConfirmClear={setConfirmClear}
        onFieldChange={handleFieldChange}
        onSave={handleSave}
        isSaving={isSaving}
        isSaved={isSaved}
        onSignOut={handleSignOut}
        signingOut={isSigningOut}
      />
    </>
  );
}

export default Sidebar;
