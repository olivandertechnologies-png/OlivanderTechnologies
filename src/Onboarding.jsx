import { useEffect, useMemo, useState } from "react";
import { loadDocumentAssets } from "./documentAssets.js";
import { PROFILE_FIELD_LIMITS, sanitizeProfileFieldInput } from "./security.js";

const TOTAL_STEPS = 4;
const SCAN_LINES = [
  "> Connecting to inbox…",
  "> Reading last 30 days of email threads…",
  "> Identifying active client conversations…",
  "> Detecting unanswered threads…",
  "> Building your business context…",
  "> 3 actions ready for your review.",
];

const palette = {
  page: "#0f1117",
  panel: "#13151f",
  panelEdge: "#1e2130",
  inset: "#0d0f17",
  insetEdge: "#2a2d3a",
  text: "#eef0f6",
  muted: "#8b8fa8",
  mutedDeep: "#5a5e72",
  amber: "#f5a623",
  amberSoft: "rgba(245, 166, 35, 0.12)",
  green: "#34c759",
};

const initialProfile = {
  name: "",
  role: "",
  signoff: "",
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.652 32.657 29.239 36 24 36c-6.627 0-12-5.373-12-12S17.373 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.27 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917Z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691 12.88 19.51C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.27 4 24 4c-7.682 0-14.356 4.337-17.694 10.691Z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.168 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.144 35.091 26.715 36 24 36c-5.218 0-9.617-3.317-11.286-7.946l-6.522 5.025C9.49 39.556 16.227 44 24 44Z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.793 2.257-2.245 4.2-4.084 5.571l.003-.002 6.19 5.238C36.971 39.165 44 34 44 24c0-1.341-.138-2.65-.389-3.917Z"
      />
    </svg>
  );
}

function Onboarding() {
  const [step, setStep] = useState(1);
  const [transitionState, setTransitionState] = useState("entered");
  const [profile, setProfile] = useState(initialProfile);
  const [isConnecting, setIsConnecting] = useState(false);
  const [scanLines, setScanLines] = useState([]);
  const [showDashboardLink, setShowDashboardLink] = useState(false);

  useEffect(() => {
    loadDocumentAssets({
      fonts: ["sora", "jetbrainsMono"],
      styles: [
        {
          id: "olivander-onboarding-motion",
          css: `
        @keyframes olivander-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes olivander-cursor {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `,
        },
      ],
    });
  }, []);

  useEffect(() => {
    let resetFrameId;

    if (step !== 4) {
      resetFrameId = window.requestAnimationFrame(() => {
        setScanLines([]);
        setShowDashboardLink(false);
      });

      return () => {
        window.cancelAnimationFrame(resetFrameId);
      };
    }

    resetFrameId = window.requestAnimationFrame(() => {
      setScanLines([]);
      setShowDashboardLink(false);
    });

    const timeouts = SCAN_LINES.map((line, index) =>
      window.setTimeout(() => {
        setScanLines((current) => [...current, line]);
      }, (index + 1) * 600),
    );

    const finalTimeout = window.setTimeout(() => {
      setShowDashboardLink(true);
    }, SCAN_LINES.length * 600 + 220);

    return () => {
      window.cancelAnimationFrame(resetFrameId);
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      window.clearTimeout(finalTimeout);
    };
  }, [step]);

  const contentStyle = useMemo(
    () => ({
      opacity: transitionState === "exiting" ? 0 : 1,
      transform:
        transitionState === "exiting"
          ? "translateY(10px)"
          : transitionState === "entering"
            ? "translateY(8px)"
            : "translateY(0)",
      transition: "opacity 220ms ease, transform 220ms ease",
    }),
    [transitionState],
  );

  const goToStep = (nextStep) => {
    setTransitionState("exiting");

    window.setTimeout(() => {
      setStep(nextStep);
      setTransitionState("entering");
      window.setTimeout(() => {
        setTransitionState("entered");
      }, 40);
    }, 200);
  };

  const handleProfileChange = (field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: sanitizeProfileFieldInput(field, value),
    }));
  };

  const handleProfileContinue = () => {
    goToStep(3);
  };

  const handleConnect = () => {
    if (isConnecting) {
      return;
    }

    setIsConnecting(true);
    window.setTimeout(() => {
      setIsConnecting(false);
      goToStep(4);
    }, 1500);
  };

  const inputStyle = {
    width: "100%",
    padding: "14px 16px",
    borderRadius: "8px",
    border: `1px solid ${palette.insetEdge}`,
    backgroundColor: palette.inset,
    color: "#ffffff",
    fontSize: "14px",
    fontFamily: "'Sora', sans-serif",
    outlineColor: palette.amber,
    boxSizing: "border-box",
  };

  const primaryButtonStyle = {
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
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        backgroundColor: palette.page,
        color: palette.text,
        fontFamily: "'Sora', sans-serif",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          backgroundColor: palette.panel,
          border: `1px solid ${palette.panelEdge}`,
          borderRadius: "16px",
          padding: "48px",
          boxSizing: "border-box",
          boxShadow: "0 28px 90px rgba(0, 0, 0, 0.28)",
        }}
      >
        <div
          style={{
            marginBottom: "28px",
            color: palette.muted,
            fontSize: "13px",
            fontWeight: 500,
          }}
        >
          Step {step} of {TOTAL_STEPS}
        </div>

        <div style={contentStyle}>
          {step === 1 ? (
            <section>
              <div
                style={{
                  width: "58px",
                  height: "58px",
                  margin: "0 auto 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "14px",
                  backgroundColor: palette.amberSoft,
                  color: palette.amber,
                  fontSize: "30px",
                  fontWeight: 700,
                }}
              >
                O
              </div>
              <h1
                style={{
                  margin: "0 0 16px",
                  textAlign: "center",
                  color: "#ffffff",
                  fontSize: "34px",
                  lineHeight: 1.05,
                  fontWeight: 600,
                  letterSpacing: "-0.05em",
                }}
              >
                Meet your agent.
              </h1>
              <p
                style={{
                  margin: "0 0 28px",
                  color: palette.muted,
                  fontSize: "16px",
                  lineHeight: 1.8,
                  textAlign: "center",
                }}
              >
                Olivander runs in the background of your business. It reads your
                emails, works out what needs to happen, and brings you the
                actions — ready to fire with one tap. You stay in control of
                everything.
              </p>
              <button type="button" onClick={() => goToStep(2)} style={primaryButtonStyle}>
                Get started
              </button>
            </section>
          ) : null}

          {step === 2 ? (
            <section>
              <h1
                style={{
                  margin: "0 0 10px",
                  color: "#ffffff",
                  fontSize: "30px",
                  lineHeight: 1.1,
                  fontWeight: 600,
                  letterSpacing: "-0.04em",
                }}
              >
                A bit about your business
              </h1>
              <p
                style={{
                  margin: "0 0 28px",
                  color: palette.muted,
                  fontSize: "15px",
                  lineHeight: 1.75,
                }}
              >
                Your agent uses this to represent you accurately from day one.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ color: "#ffffff", fontSize: "14px", fontWeight: 500 }}>
                    Your name
                  </span>
                  <input
                    value={profile.name}
                    onChange={(event) =>
                      handleProfileChange("name", event.target.value)
                    }
                    maxLength={PROFILE_FIELD_LIMITS.name}
                    placeholder="e.g. James McKenzie"
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ color: "#ffffff", fontSize: "14px", fontWeight: 500 }}>
                    What do you do?
                  </span>
                  <input
                    value={profile.role}
                    onChange={(event) =>
                      handleProfileChange("role", event.target.value)
                    }
                    maxLength={PROFILE_FIELD_LIMITS.role}
                    placeholder="e.g. Plumber, personal trainer, consultant"
                    style={inputStyle}
                  />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ color: "#ffffff", fontSize: "14px", fontWeight: 500 }}>
                    How do you sign off emails?
                  </span>
                  <input
                    value={profile.signoff}
                    onChange={(event) =>
                      handleProfileChange("signoff", event.target.value)
                    }
                    maxLength={PROFILE_FIELD_LIMITS.signoff}
                    placeholder="e.g. Cheers, James"
                    style={inputStyle}
                  />
                </label>
              </div>

              <div style={{ marginTop: "24px" }}>
                <button
                  type="button"
                  onClick={handleProfileContinue}
                  style={primaryButtonStyle}
                >
                  Continue
                </button>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section>
              <h1
                style={{
                  margin: "0 0 12px",
                  color: "#ffffff",
                  fontSize: "30px",
                  lineHeight: 1.1,
                  fontWeight: 600,
                  letterSpacing: "-0.04em",
                }}
              >
                Connect your inbox
              </h1>
              <p
                style={{
                  margin: "0 0 24px",
                  color: palette.muted,
                  fontSize: "15px",
                  lineHeight: 1.8,
                }}
              >
                Your agent needs read access to understand what's happening, and
                draft access to prepare replies. It will never send anything
                without your approval.
              </p>

              <div
                style={{
                  marginBottom: "22px",
                  padding: "16px",
                  borderRadius: "10px",
                  border: `1px solid ${palette.insetEdge}`,
                  backgroundColor: palette.inset,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "12px",
                  lineHeight: 1.9,
                  color: palette.muted,
                }}
              >
                gmail.readonly — read emails
                <br />
                gmail.compose — draft replies
                <br />
                calendar.events — create invites
              </div>

              <button
                type="button"
                onClick={handleConnect}
                disabled={isConnecting}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "12px",
                  border: "1px solid #d7d9df",
                  backgroundColor: "#ffffff",
                  color: "#161922",
                  padding: "14px 18px",
                  borderRadius: "10px",
                  fontSize: "14px",
                  fontWeight: 700,
                  fontFamily: "'Sora', sans-serif",
                  cursor: isConnecting ? "default" : "pointer",
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    animation: isConnecting
                      ? "olivander-spin 0.9s linear infinite"
                      : "none",
                  }}
                >
                  <GoogleMark />
                </span>
                {isConnecting ? "Connecting…" : "Connect Gmail"}
              </button>

              <div
                style={{
                  marginTop: "14px",
                  color: palette.mutedDeep,
                  fontSize: "13px",
                  lineHeight: 1.6,
                }}
              >
                We never store your emails. All processing happens in real
                time.
              </div>
            </section>
          ) : null}

          {step === 4 ? (
            <section>
              <h1
                style={{
                  margin: "0 0 18px",
                  color: "#ffffff",
                  fontSize: "30px",
                  lineHeight: 1.1,
                  fontWeight: 600,
                  letterSpacing: "-0.04em",
                }}
              >
                Your agent is getting to work.
              </h1>

              <div
                style={{
                  minHeight: "234px",
                  padding: "18px",
                  borderRadius: "10px",
                  border: `1px solid ${palette.insetEdge}`,
                  backgroundColor: palette.inset,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "12px",
                  lineHeight: 1.9,
                  color: palette.green,
                  boxSizing: "border-box",
                }}
              >
                {scanLines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "16px",
                    marginLeft: scanLines.length > 0 ? "2px" : 0,
                    backgroundColor: palette.green,
                    verticalAlign: "middle",
                    animation: "olivander-cursor 1s step-end infinite",
                  }}
                />
              </div>

              <a
                href="/dashboard"
                style={{
                  marginTop: "24px",
                  display: "inline-flex",
                  alignItems: "center",
                  color: palette.amber,
                  fontSize: "15px",
                  fontWeight: 700,
                  textDecoration: "none",
                  opacity: showDashboardLink ? 1 : 0,
                  transform: showDashboardLink
                    ? "translateY(0)"
                    : "translateY(6px)",
                  transition: "opacity 220ms ease, transform 220ms ease",
                  pointerEvents: showDashboardLink ? "auto" : "none",
                }}
              >
                See your first actions →
              </a>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
