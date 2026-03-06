import React, { useEffect, useState } from "react";
import TopBar from "./TopBar.jsx";

const palette = {
  page: "#0f1117",
  panel: "#13151f",
  panelEdge: "#1e2130",
  field: "#0d0f17",
  fieldEdge: "#2a2d3a",
  text: "#eef0f6",
  muted: "#8b8fa8",
  mutedDeep: "#5a5e72",
  amber: "#f5a623",
  amberSoft: "rgba(245, 166, 35, 0.14)",
  red: "#e05252",
  redMuted: "#d46c6c",
  green: "#34c759",
  greenSoft: "rgba(52, 199, 89, 0.12)",
};

const sectionLabelStyle = {
  margin: "0 0 16px",
  color: palette.amber,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
};

const fieldStyle = {
  width: "100%",
  padding: "14px 16px",
  border: `1px solid ${palette.fieldEdge}`,
  borderRadius: "8px",
  backgroundColor: palette.field,
  color: "#ffffff",
  fontSize: "14px",
  fontFamily: "'Sora', sans-serif",
  outline: `2px solid transparent`,
  outlineOffset: "0",
  boxSizing: "border-box",
};

const labelStyle = {
  marginBottom: "8px",
  color: "#ffffff",
  fontSize: "14px",
  fontWeight: 500,
};

function Settings() {
  const [profile, setProfile] = useState({
    name: "James McKenzie",
    businessName: "McKenzie Plumbing",
    work: "Residential and commercial plumbing, Queenstown",
    signoff: "Cheers, James",
    turnaround: "2 business days",
  });
  const [behaviour, setBehaviour] = useState({
    tone: "Friendly",
    followUpDelay: "After 3 days",
    autoDismissLowPriority: false,
  });
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const soraId = "olivander-font-sora";

    if (!document.getElementById(soraId)) {
      const soraLink = document.createElement("link");
      soraLink.id = soraId;
      soraLink.rel = "stylesheet";
      soraLink.href =
        "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap";
      document.head.appendChild(soraLink);
    }
  }, []);

  const handleProfileChange = (field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleBehaviourChange = (field, value) => {
    setBehaviour((current) => ({ ...current, [field]: value }));
  };

  const handleSave = () => {
    setIsSaved(true);
    window.setTimeout(() => {
      setIsSaved(false);
    }, 2000);
  };

  const selectWrapStyle = {
    position: "relative",
  };

  const selectStyle = {
    ...fieldStyle,
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    paddingRight: "42px",
    cursor: "pointer",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: palette.page,
        color: palette.text,
        fontFamily: "'Sora', sans-serif",
      }}
    >
      <TopBar />

      <main
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "48px 40px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          <a
            href="/dashboard"
            style={{
              display: "inline-block",
              marginBottom: "28px",
              color: palette.muted,
              fontSize: "14px",
              textDecoration: "none",
            }}
          >
            ← Back to dashboard
          </a>

          <h1
            style={{
              margin: "0 0 10px",
              color: "#ffffff",
              fontSize: "36px",
              lineHeight: 1.05,
              fontWeight: 600,
              letterSpacing: "-0.05em",
            }}
          >
            Settings
          </h1>
          <p
            style={{
              margin: "0 0 40px",
              color: palette.muted,
              fontSize: "15px",
              lineHeight: 1.7,
            }}
          >
            This is what your agent knows about your business.
          </p>

          <div
            style={{
              backgroundColor: palette.panel,
              border: `1px solid ${palette.panelEdge}`,
              borderRadius: "16px",
              padding: "32px",
              boxSizing: "border-box",
            }}
          >
          <section>
            <div style={sectionLabelStyle}>Business Profile</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <label style={{ display: "block" }}>
                <div style={labelStyle}>Your name</div>
                <input
                  value={profile.name}
                  onChange={(event) =>
                    handleProfileChange("name", event.target.value)
                  }
                  style={fieldStyle}
                />
              </label>

              <label style={{ display: "block" }}>
                <div style={labelStyle}>Business name</div>
                <input
                  value={profile.businessName}
                  onChange={(event) =>
                    handleProfileChange("businessName", event.target.value)
                  }
                  style={fieldStyle}
                />
              </label>

              <label style={{ display: "block" }}>
                <div style={labelStyle}>What you do</div>
                <input
                  value={profile.work}
                  onChange={(event) =>
                    handleProfileChange("work", event.target.value)
                  }
                  style={fieldStyle}
                />
              </label>

              <label style={{ display: "block" }}>
                <div style={labelStyle}>Email sign-off</div>
                <input
                  value={profile.signoff}
                  onChange={(event) =>
                    handleProfileChange("signoff", event.target.value)
                  }
                  style={fieldStyle}
                />
              </label>

              <label style={{ display: "block" }}>
                <div style={labelStyle}>Standard quote turnaround</div>
                <input
                  value={profile.turnaround}
                  onChange={(event) =>
                    handleProfileChange("turnaround", event.target.value)
                  }
                  style={fieldStyle}
                />
              </label>
            </div>
          </section>

          <div
            style={{
              margin: "40px 0",
              borderTop: `1px solid ${palette.panelEdge}`,
            }}
          />

          <section>
            <div style={sectionLabelStyle}>Agent Behaviour</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <label style={{ display: "block" }}>
                <div style={labelStyle}>Tone</div>
                <div style={selectWrapStyle}>
                  <select
                    value={behaviour.tone}
                    onChange={(event) =>
                      handleBehaviourChange("tone", event.target.value)
                    }
                    style={selectStyle}
                  >
                    <option>Professional</option>
                    <option>Friendly</option>
                    <option>Direct</option>
                  </select>
                  <span
                    style={{
                      position: "absolute",
                      right: "16px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: palette.muted,
                      pointerEvents: "none",
                    }}
                  >
                    ▾
                  </span>
                </div>
              </label>

              <label style={{ display: "block" }}>
                <div style={labelStyle}>Follow-up delay</div>
                <div style={selectWrapStyle}>
                  <select
                    value={behaviour.followUpDelay}
                    onChange={(event) =>
                      handleBehaviourChange("followUpDelay", event.target.value)
                    }
                    style={selectStyle}
                  >
                    <option>After 2 days</option>
                    <option>After 3 days</option>
                    <option>After 5 days</option>
                  </select>
                  <span
                    style={{
                      position: "absolute",
                      right: "16px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: palette.muted,
                      pointerEvents: "none",
                    }}
                  >
                    ▾
                  </span>
                </div>
              </label>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={labelStyle}>Auto-dismiss low priority actions</div>
                  <div
                    style={{
                      color: palette.muted,
                      fontSize: "13px",
                      lineHeight: 1.6,
                    }}
                  >
                    Skip routine low-value prompts unless they need your eyes.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleBehaviourChange(
                      "autoDismissLowPriority",
                      !behaviour.autoDismissLowPriority,
                    )
                  }
                  style={{
                    width: "52px",
                    height: "30px",
                    borderRadius: "999px",
                    border: `1px solid ${
                      behaviour.autoDismissLowPriority
                        ? palette.amber
                        : palette.fieldEdge
                    }`,
                    backgroundColor: behaviour.autoDismissLowPriority
                      ? palette.amber
                      : palette.fieldEdge,
                    position: "relative",
                    cursor: "pointer",
                    transition: "background-color 180ms ease",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "3px",
                      left: behaviour.autoDismissLowPriority ? "25px" : "3px",
                      width: "22px",
                      height: "22px",
                      borderRadius: "999px",
                      backgroundColor: "#ffffff",
                      transition: "left 180ms ease",
                    }}
                  />
                </button>
              </div>
            </div>
          </section>

          <div
            style={{
              margin: "40px 0",
              borderTop: `1px solid ${palette.panelEdge}`,
            }}
          />

          <section>
            <div style={sectionLabelStyle}>Integrations</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={labelStyle}>Gmail</div>
                  <div style={{ color: palette.muted, fontSize: "13px" }}>
                    Primary inbox connection
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "7px 10px",
                      borderRadius: "999px",
                      backgroundColor: palette.greenSoft,
                      color: palette.green,
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    <span>✓</span>
                    Connected
                  </div>
                  <button
                    type="button"
                    style={{
                      border: "none",
                      backgroundColor: "transparent",
                      color: palette.muted,
                      fontSize: "13px",
                      fontFamily: "'Sora', sans-serif",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={labelStyle}>Google Calendar</div>
                  <div style={{ color: palette.muted, fontSize: "13px" }}>
                    Create invites and hold time for jobs
                  </div>
                </div>
                {calendarConnected ? (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "7px 10px",
                      borderRadius: "999px",
                      backgroundColor: palette.greenSoft,
                      color: palette.green,
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    <span>✓</span>
                    Connected
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCalendarConnected(true)}
                    style={{
                      border: `1px solid ${palette.amber}`,
                      backgroundColor: palette.amber,
                      color: "#17120a",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 700,
                      fontFamily: "'Sora', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          </section>

          <div
            style={{
              margin: "40px 0",
              borderTop: `1px solid ${palette.panelEdge}`,
            }}
          />

          <section>
            <div
              style={{
                margin: "0 0 16px",
                color: palette.redMuted,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.09em",
                textTransform: "uppercase",
              }}
            >
              Danger Zone
            </div>

            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              style={{
                border: `1px solid rgba(224, 82, 82, 0.44)`,
                backgroundColor: "transparent",
                color: palette.red,
                padding: "12px 16px",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                fontFamily: "'Sora', sans-serif",
                cursor: "pointer",
              }}
            >
              Clear all agent memory
            </button>

            {confirmClear ? (
              <div
                style={{
                  marginTop: "16px",
                  padding: "16px",
                  border: `1px solid rgba(224, 82, 82, 0.24)`,
                  borderRadius: "10px",
                  backgroundColor: "rgba(224, 82, 82, 0.05)",
                }}
              >
                <div
                  style={{
                    marginBottom: "14px",
                    color: "#ffffff",
                    fontSize: "14px",
                    lineHeight: 1.7,
                  }}
                >
                  Are you sure? This cannot be undone.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    style={{
                      border: `1px solid ${palette.red}`,
                      backgroundColor: palette.red,
                      color: "#ffffff",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 700,
                      fontFamily: "'Sora', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Yes, clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    style={{
                      border: "none",
                      backgroundColor: "transparent",
                      color: palette.muted,
                      fontSize: "13px",
                      fontFamily: "'Sora', sans-serif",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </section>

            <div style={{ marginTop: "40px" }}>
              <button
                type="button"
                onClick={handleSave}
                style={{
                  width: "100%",
                  border: `1px solid ${palette.amber}`,
                  backgroundColor: palette.amber,
                  color: "#17120a",
                  padding: "14px 18px",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: 700,
                  fontFamily: "'Sora', sans-serif",
                  cursor: "pointer",
                }}
              >
                {isSaved ? "✓ Saved" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Settings;
