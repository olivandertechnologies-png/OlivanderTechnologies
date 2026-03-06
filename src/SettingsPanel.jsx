import React, { useEffect } from "react";

const palette = {
  overlay: "rgba(0,0,0,0.5)",
  panel: "#0e1422",
  page: "#080c14",
  border: "rgba(255,255,255,0.07)",
  field: "rgba(255,255,255,0.1)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.45)",
  blue: "#4f8ef7",
  blueSoft: "rgba(79,142,247,0.12)",
  red: "#e05252",
};

const labelStyle = {
  marginBottom: "6px",
  color: palette.muted,
  fontSize: "12px",
  fontWeight: 500,
};

const fieldStyle = {
  width: "100%",
  padding: "8px 12px",
  border: `1px solid ${palette.field}`,
  borderRadius: "8px",
  backgroundColor: palette.page,
  color: palette.text,
  fontSize: "14px",
  fontFamily: "'DM Sans', sans-serif",
  boxSizing: "border-box",
  outline: "none",
};

function SettingsPanel({
  isOpen,
  onClose,
  settings,
  initials,
  loading,
  error,
  confirmClear,
  setConfirmClear,
  onFieldChange,
  onSave,
  isSaving,
  isSaved,
  onSignOut,
  signingOut,
}) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  const { profile, behaviour, integrations } = settings;
  const isDisabled = loading || isSaving || signingOut;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 140,
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: palette.overlay,
          backdropFilter: "blur(4px)",
          opacity: isOpen ? 1 : 0,
          transition: "opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />

      <aside
        aria-hidden={!isOpen}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: "420px",
          maxWidth: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: palette.panel,
          borderLeft: `1px solid ${palette.border}`,
          boxSizing: "border-box",
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div
          style={{
            padding: "28px 24px 24px",
            borderBottom: `1px solid ${palette.border}`,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              position: "absolute",
              top: "18px",
              right: "18px",
              border: "none",
              backgroundColor: "transparent",
              color: palette.muted,
              fontSize: "20px",
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            ×
          </button>

          <div
            style={{
              width: "56px",
              height: "56px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "999px",
              backgroundColor: palette.blue,
              color: palette.text,
              fontSize: "18px",
              fontWeight: 700,
            }}
          >
            {initials}
          </div>

          <div
            style={{
              marginTop: "18px",
              color: palette.text,
              fontSize: "18px",
              fontWeight: 600,
            }}
          >
            {profile.name || "Your profile"}
          </div>
          <div
            style={{
              marginTop: "6px",
              color: palette.muted,
              fontSize: "14px",
            }}
          >
            {profile.businessName || "Add your business name"}
          </div>

          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              marginTop: "14px",
              padding: "5px 10px",
              borderRadius: "999px",
              backgroundColor: palette.blueSoft,
              color: palette.blue,
              fontSize: "12px",
              fontWeight: 600,
            }}
          >
            Pro plan · $49/month
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "22px 24px 32px",
            boxSizing: "border-box",
          }}
        >
          {error ? (
            <div
              style={{
                marginBottom: "18px",
                color: palette.muted,
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              {error}
            </div>
          ) : null}

          <section>
            <div
              style={{
                marginBottom: "16px",
                color: palette.muted,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Business Profile
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <label>
                <div style={labelStyle}>Your name</div>
                <input
                  value={profile.name}
                  onChange={(event) =>
                    onFieldChange("profile", "name", event.target.value)
                  }
                  style={fieldStyle}
                  disabled={isDisabled}
                />
              </label>
              <label>
                <div style={labelStyle}>Business name</div>
                <input
                  value={profile.businessName}
                  onChange={(event) =>
                    onFieldChange("profile", "businessName", event.target.value)
                  }
                  style={fieldStyle}
                  disabled={isDisabled}
                />
              </label>
              <label>
                <div style={labelStyle}>What you do</div>
                <input
                  value={profile.work}
                  onChange={(event) =>
                    onFieldChange("profile", "work", event.target.value)
                  }
                  style={fieldStyle}
                  disabled={isDisabled}
                />
              </label>
              <label>
                <div style={labelStyle}>Email sign-off</div>
                <input
                  value={profile.signoff}
                  onChange={(event) =>
                    onFieldChange("profile", "signoff", event.target.value)
                  }
                  style={fieldStyle}
                  disabled={isDisabled}
                />
              </label>
              <label>
                <div style={labelStyle}>Standard quote turnaround</div>
                <input
                  value={profile.turnaround}
                  onChange={(event) =>
                    onFieldChange("profile", "turnaround", event.target.value)
                  }
                  style={fieldStyle}
                  disabled={isDisabled}
                />
              </label>
            </div>
          </section>

          <div style={{ margin: "26px 0", borderTop: `1px solid ${palette.border}` }} />

          <section>
            <div
              style={{
                marginBottom: "16px",
                color: palette.muted,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Agent Behaviour
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <label>
                <div style={labelStyle}>Tone</div>
                <select
                  value={behaviour.tone}
                  onChange={(event) =>
                    onFieldChange("behaviour", "tone", event.target.value)
                  }
                  style={fieldStyle}
                  disabled={isDisabled}
                >
                  <option>Professional</option>
                  <option>Friendly</option>
                  <option>Direct</option>
                </select>
              </label>
              <label>
                <div style={labelStyle}>Follow-up delay</div>
                <select
                  value={behaviour.followUpDelay}
                  onChange={(event) =>
                    onFieldChange("behaviour", "followUpDelay", event.target.value)
                  }
                  style={fieldStyle}
                  disabled={isDisabled}
                >
                  <option>After 2 days</option>
                  <option>After 3 days</option>
                  <option>After 5 days</option>
                </select>
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
                  <div style={labelStyle}>Auto-dismiss low priority</div>
                  <div style={{ color: palette.muted, fontSize: "13px" }}>
                    Skip routine prompts unless they need you.
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() =>
                    onFieldChange(
                      "behaviour",
                      "autoDismissLowPriority",
                      !behaviour.autoDismissLowPriority,
                    )
                  }
                  style={{
                    width: "46px",
                    height: "26px",
                    border: "none",
                    borderRadius: "999px",
                    backgroundColor: behaviour.autoDismissLowPriority
                      ? palette.blue
                      : "rgba(255,255,255,0.12)",
                    position: "relative",
                    cursor: isDisabled ? "default" : "pointer",
                    flexShrink: 0,
                    opacity: isDisabled ? 0.6 : 1,
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "3px",
                      left: behaviour.autoDismissLowPriority ? "23px" : "3px",
                      width: "20px",
                      height: "20px",
                      borderRadius: "999px",
                      backgroundColor: "#ffffff",
                      transition: "left 180ms ease",
                    }}
                  />
                </button>
              </div>
            </div>
          </section>

          <div style={{ margin: "26px 0", borderTop: `1px solid ${palette.border}` }} />

          <section>
            <div
              style={{
                marginBottom: "16px",
                color: palette.muted,
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Integrations
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={{ color: palette.text, fontSize: "14px", fontWeight: 500 }}>
                    Gmail
                  </div>
                  <div style={{ color: palette.muted, fontSize: "13px" }}>
                    Connected
                  </div>
                </div>

                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "4px 10px",
                    borderRadius: "999px",
                    backgroundColor: "rgba(52,199,89,0.12)",
                    color: "#34c759",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  <span>✓</span>
                  Connected
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
                  <div style={{ color: palette.text, fontSize: "14px", fontWeight: 500 }}>
                    Google Calendar
                  </div>
                  <div style={{ color: palette.muted, fontSize: "13px" }}>
                    {integrations.calendarConnected ? "Connected" : "Not connected"}
                  </div>
                </div>

                {integrations.calendarConnected ? (
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      backgroundColor: "rgba(52,199,89,0.12)",
                      color: "#34c759",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    <span>✓</span>
                    Connected
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() =>
                      onFieldChange("integrations", "calendarConnected", true)
                    }
                    style={{
                      border: `1px solid ${palette.blue}`,
                      borderRadius: "8px",
                      backgroundColor: palette.blue,
                      color: "#080c14",
                      padding: "8px 12px",
                      fontSize: "13px",
                      fontWeight: 700,
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: isDisabled ? "default" : "pointer",
                      opacity: isDisabled ? 0.6 : 1,
                    }}
                  >
                    Connect
                  </button>
                )}
              </div>
            </div>
          </section>

          <div style={{ margin: "26px 0", borderTop: `1px solid ${palette.border}` }} />

          <section>
            <div
              style={{
                marginBottom: "16px",
                color: "rgba(224,82,82,0.72)",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Danger Zone
            </div>

            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              style={{
                border: `1px solid rgba(224,82,82,0.45)`,
                borderRadius: "8px",
                backgroundColor: "transparent",
                color: palette.red,
                padding: "10px 14px",
                fontSize: "13px",
                fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
              }}
            >
              Clear all agent memory
            </button>

            {confirmClear ? (
              <div
                style={{
                  marginTop: "14px",
                  padding: "14px",
                  border: `1px solid rgba(224,82,82,0.2)`,
                  borderRadius: "10px",
                  backgroundColor: "rgba(224,82,82,0.05)",
                }}
              >
                <div
                  style={{
                    marginBottom: "12px",
                    color: palette.text,
                    fontSize: "13px",
                    lineHeight: 1.6,
                  }}
                >
                  Are you sure? This cannot be undone.
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    style={{
                      border: "none",
                      borderRadius: "8px",
                      backgroundColor: palette.red,
                      color: "#ffffff",
                      padding: "8px 12px",
                      fontSize: "13px",
                      fontWeight: 700,
                      fontFamily: "'DM Sans', sans-serif",
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
                      padding: 0,
                      fontSize: "13px",
                      fontFamily: "'DM Sans', sans-serif",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <div
          style={{
            position: "sticky",
            bottom: 0,
            padding: "16px 24px 20px",
            borderTop: `1px solid ${palette.border}`,
            backgroundColor: palette.panel,
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <button
            type="button"
            onClick={onSave}
            disabled={isDisabled}
            style={{
              width: "100%",
              border: "none",
              borderRadius: "10px",
              backgroundColor: "#ffffff",
              color: "#080c14",
              padding: "13px 16px",
              fontSize: "14px",
              fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              cursor: isDisabled ? "default" : "pointer",
              opacity: isDisabled ? 0.7 : 1,
            }}
          >
            {isSaving ? "Saving..." : isSaved ? "✓ Saved" : "Save changes"}
          </button>

          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            style={{
              width: "100%",
              border: `1px solid ${palette.border}`,
              borderRadius: "10px",
              backgroundColor: "transparent",
              color: palette.muted,
              padding: "12px 16px",
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: signingOut ? "default" : "pointer",
              opacity: signingOut ? 0.7 : 1,
            }}
          >
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>
    </div>
  );
}

export default SettingsPanel;
