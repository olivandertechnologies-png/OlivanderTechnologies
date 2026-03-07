import { useEffect, useMemo, useState } from "react";
import {
  buildAgentContext,
  fetchDoneTodayActions,
  fetchPendingActions,
  fetchUserProfile,
  generateAction,
  updateActionStatus,
} from "./dataLayer.js";
import { loadDocumentAssets } from "./documentAssets.js";
import { useAuth } from "./hooks/useAuth.js";
import { ACTION_PROMPT_MAX_LENGTH, sanitizePromptInput } from "./security.js";
import Sidebar from "./Sidebar.jsx";

const palette = {
  page: "#080c14",
  surface: "#0e1422",
  border: "rgba(255,255,255,0.07)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.4)",
  mutedStrong: "rgba(255,255,255,0.55)",
  faint: "rgba(255,255,255,0.2)",
  blue: "#4f8ef7",
  blueSoft: "rgba(79,142,247,0.12)",
  blueSoftStrong: "rgba(79,142,247,0.15)",
  blueGlow: "rgba(79,142,247,0.3)",
  green: "#34c759",
  amber: "#f5a623",
  red: "#e05252",
  tooltip: "#121926",
  mono: "rgba(255,255,255,0.7)",
  dismiss: "rgba(255,255,255,0.3)",
};

function inferActionType(action) {
  const content = `${action.title} ${action.draft}`.toLowerCase();

  if (content.includes("invoice") || content.includes("payment")) {
    return "Invoice";
  }

  if (content.includes("calendar") || content.includes("invite")) {
    return "Calendar";
  }

  return "Email";
}

function DashboardShellMessage({ message }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: palette.page,
        color: palette.muted,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {message}
    </div>
  );
}

function ChevronIcon({ expanded }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      style={{
        width: "12px",
        height: "12px",
        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 250ms ease",
      }}
    >
      <path
        d="M2.25 4.5 6 8.25 9.75 4.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function getConfidencePresentation(confidence) {
  switch (confidence) {
    case "high":
      return {
        label: "High confidence",
        color: palette.green,
      };
    case "medium":
      return {
        label: "Review carefully",
        color: palette.amber,
      };
    case "low":
      return {
        label: "Needs your attention",
        color: palette.red,
      };
    default:
      return null;
  }
}

function getPriorityAccentColor(priorityScore) {
  if (priorityScore >= 8) {
    return palette.red;
  }

  if (priorityScore >= 5) {
    return palette.amber;
  }

  return null;
}

function getActionCreatedAtValue(action) {
  if (!action?.createdAt) {
    return 0;
  }

  const parsedDate = new Date(action.createdAt);
  return Number.isNaN(parsedDate.getTime()) ? 0 : parsedDate.getTime();
}

function ActionCard({ action, onApprove, onDismiss }) {
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isConfidenceHovered, setIsConfidenceHovered] = useState(false);

  const isApproving = action.phase === "approving";
  const isDismissing = action.phase === "dismissing";
  const hasSteps = action.steps.length > 0;
  const stepTrailMaxHeight = `${action.steps.length * 72 + 32}px`;
  const confidencePresentation = getConfidencePresentation(action.confidence);
  const priorityAccentColor = getPriorityAccentColor(action.priorityScore);

  return (
    <article
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        backgroundColor: palette.surface,
        border: `1px solid ${palette.border}`,
        borderTop: `2px solid ${isHovered ? palette.blue : "transparent"}`,
        borderRadius: "14px",
        padding: "24px",
        boxSizing: "border-box",
        boxShadow: priorityAccentColor ? `inset 3px 0 0 ${priorityAccentColor}` : "none",
        transition:
          "opacity 300ms ease, transform 300ms ease, border-top-color 180ms ease",
        opacity: isApproving || isDismissing ? 0 : 1,
        transform: isApproving
          ? "scale(0.98)"
          : isDismissing
            ? "translateX(-20px)"
            : "translateX(0) scale(1)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 8px",
            borderRadius: "20px",
            backgroundColor: palette.blueSoft,
            color: palette.blue,
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          {inferActionType(action)}
        </div>

        {confidencePresentation ? (
          <div style={{ marginLeft: "auto", position: "relative" }}>
            <button
              type="button"
              onMouseEnter={() => setIsConfidenceHovered(true)}
              onMouseLeave={() => setIsConfidenceHovered(false)}
              onFocus={() => setIsConfidenceHovered(true)}
              onBlur={() => setIsConfidenceHovered(false)}
              aria-label={confidencePresentation.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: 0,
                border: "none",
                backgroundColor: "transparent",
                color: confidencePresentation.color,
                fontSize: "11px",
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "help",
                whiteSpace: "nowrap",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "999px",
                  backgroundColor: confidencePresentation.color,
                  flexShrink: 0,
                }}
              />
              <span>{confidencePresentation.label}</span>
            </button>

            {isConfidenceHovered && action.confidenceReason ? (
              <div
                role="tooltip"
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: "calc(100% + 8px)",
                  minWidth: "220px",
                  maxWidth: "260px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  backgroundColor: palette.tooltip,
                  color: "rgba(255,255,255,0.85)",
                  fontSize: "12px",
                  lineHeight: 1.5,
                  boxShadow: "0 12px 24px rgba(0,0,0,0.22)",
                  pointerEvents: "none",
                  zIndex: 2,
                }}
              >
                {action.confidenceReason}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        style={{
          color: palette.muted,
          fontSize: "13px",
          lineHeight: 1.5,
        }}
      >
        {action.reasoning}
      </div>

      <div
        style={{
          margin: "6px 0 0",
          color: palette.text,
          fontSize: "16px",
          lineHeight: 1.3,
          fontWeight: 600,
          letterSpacing: "-0.02em",
        }}
      >
        {action.title}
      </div>

      {hasSteps ? (
        <>
          <button
            type="button"
            onClick={() => setIsReasoningOpen((current) => !current)}
            aria-expanded={isReasoningOpen}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "8px",
              padding: 0,
              border: "none",
              backgroundColor: "transparent",
              color: palette.muted,
              fontSize: "13px",
              lineHeight: 1.4,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
            }}
          >
            <ChevronIcon expanded={isReasoningOpen} />
            {isReasoningOpen ? "Hide reasoning" : "See reasoning"}
          </button>

          <div
            style={{
              maxHeight: isReasoningOpen ? stepTrailMaxHeight : "0",
              overflow: "hidden",
              transition: "max-height 250ms ease",
            }}
          >
            <div
              style={{
                marginTop: "8px",
                padding: "12px 16px",
                borderRadius: "8px",
                backgroundColor: "rgba(255,255,255,0.03)",
              }}
            >
              {action.steps.map((step, index) => (
                <div
                  key={`${action.id}-step-${index + 1}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                    padding: "4px 0",
                  }}
                >
                  <div
                    style={{
                      width: "18px",
                      height: "18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "999px",
                      backgroundColor: palette.blueSoftStrong,
                      color: palette.blue,
                      fontSize: "11px",
                      lineHeight: 1,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div
                    style={{
                      color: palette.mutedStrong,
                      fontSize: "13px",
                      lineHeight: 1.55,
                    }}
                  >
                    {step}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div
        style={{
          marginTop: "16px",
          border: `1px solid rgba(255,255,255,0.06)`,
          borderRadius: "10px",
          backgroundColor: "rgba(255,255,255,0.03)",
          padding: "16px",
        }}
      >
        <pre
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            color: palette.mono,
            fontSize: "12.5px",
            lineHeight: 1.78,
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {action.draft}
        </pre>
      </div>

      <div
        style={{
          marginTop: "20px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <button
          type="button"
          onClick={() => onApprove(action)}
          disabled={isApproving || isDismissing}
          style={{
            border: "none",
            backgroundColor: "#ffffff",
            color: palette.page,
            padding: "8px 20px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif",
            cursor: isApproving || isDismissing ? "default" : "pointer",
            opacity: isApproving || isDismissing ? 0.6 : 1,
            transform: isHovered ? "scale(1.02)" : "scale(1)",
            transition: "transform 160ms ease, opacity 160ms ease",
          }}
        >
          Approve
        </button>

        <button
          type="button"
          onClick={() => onDismiss(action)}
          disabled={isApproving || isDismissing}
          style={{
            border: "none",
            backgroundColor: "transparent",
            color: isHovered ? "rgba(255,255,255,0.6)" : palette.dismiss,
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: 500,
            fontFamily: "'DM Sans', sans-serif",
            cursor: isApproving || isDismissing ? "default" : "pointer",
            opacity: isApproving || isDismissing ? 0.6 : 1,
            transition: "color 160ms ease, opacity 160ms ease",
          }}
        >
          Dismiss
        </button>

        <div
          style={{
            marginLeft: "auto",
            color: palette.faint,
            fontSize: "11px",
            fontWeight: 500,
          }}
        >
          Prepared {action.time}
        </div>
      </div>
    </article>
  );
}

function App() {
  const { user, loading } = useAuth();
  const [actions, setActions] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [contextItems, setContextItems] = useState([]);
  const [profileSettings, setProfileSettings] = useState(null);
  const [generatorPrompt, setGeneratorPrompt] = useState("");
  const [generatorCard, setGeneratorCard] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBarFocused, setIsBarFocused] = useState(false);
  const [loadingActions, setLoadingActions] = useState(true);
  const [loadingCompleted, setLoadingCompleted] = useState(true);
  const [feedError, setFeedError] = useState("");
  const [completedError, setCompletedError] = useState("");
  const [contextError, setContextError] = useState("");
  const sortedActions = useMemo(
    () =>
      [...actions].sort((left, right) => {
        if (right.priorityScore !== left.priorityScore) {
          return right.priorityScore - left.priorityScore;
        }

        return getActionCreatedAtValue(right) - getActionCreatedAtValue(left);
      }),
    [actions],
  );

  useEffect(() => {
    loadDocumentAssets({
      fonts: ["dmSans", "jetbrainsMono"],
      styles: [
        {
          id: "olivander-dashboard-motion",
          css: `
        @keyframes olivander-shimmer {
          0% { opacity: 0.4; }
          50% { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
        @keyframes olivander-done-in {
          0% { opacity: 0; transform: translateY(-8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
      `,
        },
      ],
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      if (!user) {
        return;
      }

      setLoadingActions(true);
      setLoadingCompleted(true);
      setFeedError("");
      setCompletedError("");
      setContextError("");

      try {
        const pendingActions = await fetchPendingActions(user.id);
        if (isMounted) {
          setActions(pendingActions);
        }
      } catch (error) {
        console.error("Failed to fetch pending actions", error);
        if (isMounted) {
          setFeedError("Something went wrong. Try refreshing.");
          setActions([]);
        }
      } finally {
        if (isMounted) {
          setLoadingActions(false);
        }
      }

      try {
        const doneActions = await fetchDoneTodayActions(user.id);
        if (isMounted) {
          setCompleted(doneActions);
        }
      } catch (error) {
        console.error("Failed to fetch completed actions", error);
        if (isMounted) {
          setCompletedError("Something went wrong. Try refreshing.");
          setCompleted([]);
        }
      } finally {
        if (isMounted) {
          setLoadingCompleted(false);
        }
      }

      try {
        const settings = await fetchUserProfile(user);
        if (isMounted) {
          setProfileSettings(settings);
          setContextItems(buildAgentContext(settings));
        }
      } catch (error) {
        console.error("Failed to fetch user context", error);
        if (isMounted) {
          setProfileSettings(null);
          setContextError("Something went wrong. Try refreshing.");
          setContextItems([]);
        }
      }
    };

    void loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const approveAction = async (actionToApprove) => {
    setFeedError("");
    setActions((current) =>
      current.map((action) =>
        action.id === actionToApprove.id ? { ...action, phase: "approving" } : action,
      ),
    );

    try {
      const approvedAction = await updateActionStatus(actionToApprove.id, "approved");

      window.setTimeout(() => {
        setActions((current) =>
          current.filter((action) => action.id !== actionToApprove.id),
        );
        setCompleted((current) => [approvedAction, ...current]);
      }, 300);
    } catch (error) {
      console.error("Failed to approve action", error);
      setFeedError(error?.message || "Something went wrong. Try refreshing.");
      setActions((current) =>
        current.map((action) =>
          action.id === actionToApprove.id ? { ...action, phase: "idle" } : action,
        ),
      );
    }
  };

  const dismissAction = async (actionToDismiss) => {
    setFeedError("");
    setActions((current) =>
      current.map((action) =>
        action.id === actionToDismiss.id ? { ...action, phase: "dismissing" } : action,
      ),
    );

    try {
      await updateActionStatus(actionToDismiss.id, "dismissed");

      window.setTimeout(() => {
        setActions((current) =>
          current.filter((action) => action.id !== actionToDismiss.id),
        );
      }, 250);
    } catch (error) {
      console.error("Failed to dismiss action", error);
      setFeedError(error?.message || "Something went wrong. Try refreshing.");
      setActions((current) =>
        current.map((action) =>
          action.id === actionToDismiss.id ? { ...action, phase: "idle" } : action,
        ),
      );
    }
  };

  const handleGenerateAction = async (event) => {
    event.preventDefault();

    const prompt = generatorPrompt.trim();
    if (!prompt || isGenerating || !user) {
      return;
    }

    setGeneratorPrompt("");
    setIsGenerating(true);
    setGeneratorCard({ status: "loading" });
    setFeedError("");

    try {
      const createdAction = await generateAction(prompt, {
        name: profileSettings?.profile?.name || "",
        business_name: profileSettings?.profile?.businessName || "",
        what_you_do: profileSettings?.profile?.work || "",
        email_signoff: profileSettings?.profile?.signoff || "",
      });

      setActions((current) => [createdAction, ...current]);
      setGeneratorCard(null);
    } catch (error) {
      console.error("Failed to generate action", error);
      setGeneratorCard({
        status: "error",
        message: error?.message || "The agent couldn't generate an action. Try rephrasing.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const renderSkeletonCard = (key) => (
    <article
      key={key}
      style={{
        backgroundColor: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: "14px",
        padding: "24px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "60px",
          height: "20px",
          marginBottom: "12px",
          borderRadius: "20px",
          backgroundColor: "rgba(255,255,255,0.08)",
          animation: "olivander-shimmer 1.4s ease-in-out infinite",
        }}
      />
      <div
        style={{
          width: "54%",
          height: "12px",
          marginBottom: "10px",
          borderRadius: "8px",
          backgroundColor: "rgba(255,255,255,0.08)",
          animation: "olivander-shimmer 1.4s ease-in-out infinite",
        }}
      />
      <div
        style={{
          width: "62%",
          height: "18px",
          marginBottom: "16px",
          borderRadius: "8px",
          backgroundColor: "rgba(255,255,255,0.08)",
          animation: "olivander-shimmer 1.4s ease-in-out infinite",
        }}
      />
      <div
        style={{
          border: `1px solid rgba(255,255,255,0.06)`,
          borderRadius: "10px",
          backgroundColor: "rgba(255,255,255,0.03)",
          padding: "16px",
          marginBottom: "20px",
        }}
      >
        {[100, 92, 74].map((width, index) => (
          <div
            key={width}
            style={{
              width: `${width}%`,
              height: "12px",
              marginBottom: index === 2 ? 0 : "10px",
              borderRadius: "8px",
              backgroundColor: "rgba(255,255,255,0.08)",
              animation: "olivander-shimmer 1.4s ease-in-out infinite",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div
          style={{
            width: "98px",
            height: "34px",
            borderRadius: "8px",
            backgroundColor: "rgba(255,255,255,0.08)",
            animation: "olivander-shimmer 1.4s ease-in-out infinite",
          }}
        />
        <div
          style={{
            width: "82px",
            height: "20px",
            borderRadius: "8px",
            backgroundColor: "rgba(255,255,255,0.08)",
            animation: "olivander-shimmer 1.4s ease-in-out infinite",
          }}
        />
        <div
          style={{
            marginLeft: "auto",
            width: "92px",
            height: "10px",
            borderRadius: "8px",
            backgroundColor: "rgba(255,255,255,0.08)",
            animation: "olivander-shimmer 1.4s ease-in-out infinite",
          }}
        />
      </div>
    </article>
  );

  const renderGeneratorCard = () => {
    if (!generatorCard) {
      return null;
    }

    if (generatorCard.status === "loading") {
      return renderSkeletonCard("generator-loading");
    }

    return (
      <article
        style={{
          backgroundColor: palette.surface,
          border: `1px solid ${palette.border}`,
          borderRadius: "14px",
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            color: palette.muted,
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          {generatorCard.message}
        </div>
      </article>
    );
  };

  if (loading) {
    return <DashboardShellMessage message="Checking your session..." />;
  }

  if (!user) {
    return null;
  }

  const hasVisibleFeedItems = Boolean(generatorCard) || actions.length > 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        backgroundColor: palette.page,
        color: palette.text,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <Sidebar user={user} />

      <main
        style={{
          marginLeft: "220px",
          padding: "48px 40px",
          boxSizing: "border-box",
          width: "calc(100% - 220px)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 280px",
            gap: "28px",
            alignItems: "start",
          }}
        >
          <section style={{ minWidth: 0 }}>
            <form
              onSubmit={handleGenerateAction}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                marginBottom: "24px",
                padding: "10px 10px 10px 14px",
                borderRadius: "12px",
                border: `1px solid ${palette.border}`,
                backgroundColor: "transparent",
                boxShadow: isBarFocused
                  ? `0 0 0 2px ${palette.blueGlow}`
                  : "0 0 0 0 transparent",
                transition: "box-shadow 180ms ease, border-color 180ms ease",
              }}
            >
              <div
                style={{
                  color: palette.blue,
                  fontSize: "16px",
                  lineHeight: 1,
                }}
              >
                ✦
              </div>
              <input
                value={generatorPrompt}
                onChange={(event) =>
                  setGeneratorPrompt(sanitizePromptInput(event.target.value))
                }
                onFocus={() => setIsBarFocused(true)}
                onBlur={() => setIsBarFocused(false)}
                maxLength={ACTION_PROMPT_MAX_LENGTH}
                placeholder="What needs to happen?"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  backgroundColor: "transparent",
                  color: "#ffffff",
                  fontSize: "15px",
                  fontFamily: "'DM Sans', sans-serif",
                  outline: "none",
                }}
              />
              <button
                type="submit"
                disabled={isGenerating}
                style={{
                  border: "none",
                  borderRadius: "8px",
                  backgroundColor: palette.blue,
                  color: "#ffffff",
                  padding: "9px 14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: isGenerating ? "default" : "pointer",
                  opacity: isGenerating ? 0.72 : 1,
                }}
              >
                Generate
              </button>
            </form>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "18px",
              }}
            >
              <div>
                <h1
                  style={{
                    margin: 0,
                    color: "#ffffff",
                    fontSize: "34px",
                    lineHeight: 1.02,
                    fontWeight: 700,
                    letterSpacing: "-0.05em",
                  }}
                >
                  Pending actions
                </h1>
              </div>
              <div
                style={{
                  minWidth: "28px",
                  padding: "4px 10px",
                  borderRadius: "999px",
                  backgroundColor: palette.blueSoft,
                  color: palette.blue,
                  fontSize: "12px",
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {loadingActions ? "..." : actions.length}
              </div>
            </div>

            {feedError ? (
              <div
                style={{
                  marginBottom: "14px",
                  color: palette.muted,
                  fontSize: "13px",
                }}
              >
                {feedError}
              </div>
            ) : null}

            {loadingActions ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {Array.from({ length: 3 }, (_, index) => renderSkeletonCard(`feed-${index}`))}
              </div>
            ) : hasVisibleFeedItems ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {renderGeneratorCard()}
                {sortedActions.map((action) => (
                  <ActionCard
                    key={action.id}
                    action={action}
                    onApprove={approveAction}
                    onDismiss={dismissAction}
                  />
                ))}
              </div>
            ) : (
              <div
                style={{
                  minHeight: "420px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `1px solid ${palette.border}`,
                  borderRadius: "16px",
                  backgroundColor: palette.surface,
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      margin: "0 auto 18px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "999px",
                      backgroundColor: palette.blueSoft,
                      color: palette.blue,
                      fontSize: "24px",
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </div>
                  <div
                    style={{
                      marginBottom: "8px",
                      color: "#ffffff",
                      fontSize: "26px",
                      fontWeight: 700,
                      letterSpacing: "-0.04em",
                    }}
                  >
                    You're all caught up.
                  </div>
                  <div
                    style={{
                      color: palette.muted,
                      fontSize: "14px",
                    }}
                  >
                    The agent is watching your inbox.
                  </div>
                </div>
              </div>
            )}
          </section>

          <aside
            style={{
              width: "280px",
              position: "sticky",
              top: "80px",
              display: "flex",
              flexDirection: "column",
              gap: "14px",
            }}
          >
            <section
              style={{
                backgroundColor: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: "16px",
                padding: "18px",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  marginBottom: "14px",
                  color: palette.muted,
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Agent context
              </div>

              {contextError ? (
                <div
                  style={{
                    color: palette.muted,
                    fontSize: "13px",
                    lineHeight: 1.55,
                  }}
                >
                  {contextError}
                </div>
              ) : contextItems.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {contextItems.map((memory) => (
                    <div
                      key={memory}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                      }}
                    >
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          marginTop: "7px",
                          borderRadius: "999px",
                          backgroundColor: palette.blue,
                          flexShrink: 0,
                        }}
                      />
                      <div
                        style={{
                          color: palette.muted,
                          fontSize: "13px",
                          lineHeight: 1.55,
                        }}
                      >
                        {memory}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    color: palette.muted,
                    fontSize: "13px",
                    lineHeight: 1.55,
                  }}
                >
                  Complete your settings to teach the agent more about your business.
                </div>
              )}
            </section>

            <section
              style={{
                backgroundColor: palette.surface,
                border: `1px solid ${palette.border}`,
                borderRadius: "16px",
                padding: "18px",
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "14px",
                }}
              >
                <div
                  style={{
                    color: palette.muted,
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                  }}
                >
                  Done today
                </div>
                <div
                  style={{
                    padding: "3px 9px",
                    borderRadius: "999px",
                    backgroundColor: "rgba(52,199,89,0.12)",
                    color: palette.green,
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  {loadingCompleted ? "..." : completed.length}
                </div>
              </div>

              {completedError ? (
                <div
                  style={{
                    color: palette.muted,
                    fontSize: "13px",
                    lineHeight: 1.55,
                  }}
                >
                  {completedError}
                </div>
              ) : loadingCompleted ? (
                <div
                  style={{
                    color: palette.muted,
                    fontSize: "13px",
                    lineHeight: 1.55,
                  }}
                >
                  Loading approved actions...
                </div>
              ) : completed.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {completed.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        animation: "olivander-done-in 260ms ease",
                      }}
                    >
                      <span
                        style={{
                          color: palette.green,
                          fontSize: "14px",
                          lineHeight: 1.4,
                          fontWeight: 700,
                        }}
                      >
                        ✓
                      </span>
                      <div
                        style={{
                          color: palette.muted,
                          fontSize: "13px",
                          lineHeight: 1.5,
                        }}
                      >
                        {item.title}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    color: palette.muted,
                    fontSize: "13px",
                    lineHeight: 1.55,
                  }}
                >
                  No approved actions yet today.
                </div>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

export default App;
