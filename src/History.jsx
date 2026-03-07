import { useEffect, useMemo, useState } from "react";
import { fetchHistoryActions } from "./dataLayer.js";
import { loadDocumentAssets } from "./documentAssets.js";
import { useAuth } from "./hooks/useAuth.js";
import Sidebar from "./Sidebar.jsx";

const palette = {
  page: "#080c14",
  surface: "#0e1422",
  inset: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.07)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.45)",
  faint: "rgba(255,255,255,0.28)",
  blue: "#4f8ef7",
  blueSoft: "rgba(79,142,247,0.12)",
  green: "#34c759",
  greenSoft: "rgba(52,199,89,0.12)",
  dismiss: "rgba(255,255,255,0.3)",
  dismissSoft: "rgba(255,255,255,0.05)",
  mono: "rgba(255,255,255,0.7)",
};

const filterTabs = ["All", "Approved", "Dismissed"];

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

function formatHistoryTimestamp(value) {
  if (!value) {
    return "Date unavailable";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getStatusStyles(status) {
  if (status === "approved") {
    return {
      color: palette.green,
      backgroundColor: palette.greenSoft,
      label: "Approved",
    };
  }

  return {
    color: palette.dismiss,
    backgroundColor: palette.dismissSoft,
    label: "Dismissed",
  };
}

function getEmptyStateMessage(activeFilter) {
  if (activeFilter === "Approved") {
    return "No approved actions yet.";
  }

  if (activeFilter === "Dismissed") {
    return "No dismissed actions yet.";
  }

  return "No history yet.";
}

function HistoryShellMessage({ message }) {
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

function HistoryCard({ action }) {
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const actionType = inferActionType(action);
  const statusStyles = getStatusStyles(action.status);

  return (
    <article
      style={{
        backgroundColor: palette.surface,
        border: `1px solid ${palette.border}`,
        borderRadius: "14px",
        padding: "20px 24px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: "14px",
        }}
      >
        <div
          style={{
            color: palette.muted,
            fontSize: "12px",
            lineHeight: 1.5,
          }}
        >
          {formatHistoryTimestamp(action.createdAt)}
        </div>

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
            flexShrink: 0,
          }}
        >
          {actionType}
        </div>
      </div>

      <div
        style={{
          marginBottom: "14px",
          color: palette.text,
          fontSize: "16px",
          lineHeight: 1.3,
          fontWeight: 600,
          letterSpacing: "-0.02em",
        }}
      >
        {action.title}
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-expanded={isDraftOpen}
        onClick={() => setIsDraftOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setIsDraftOpen((current) => !current);
          }
        }}
        style={{
          border: `1px solid rgba(255,255,255,0.06)`,
          borderRadius: "10px",
          backgroundColor: palette.inset,
          padding: "14px 16px",
          cursor: "pointer",
          outline: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <div
            style={{
              color: palette.muted,
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Original draft
          </div>

          <div
            style={{
              color: palette.muted,
              fontSize: "12px",
            }}
          >
            {isDraftOpen ? "Hide" : "Show"}
          </div>
        </div>

        <div
          style={{
            maxHeight: isDraftOpen ? "720px" : "0",
            overflow: "hidden",
            transition: "max-height 260ms ease",
          }}
        >
          <pre
            style={{
              margin: isDraftOpen ? "14px 0 0" : "0",
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
      </div>

      <div
        style={{
          marginTop: "14px",
          color: palette.muted,
          fontSize: "13px",
          lineHeight: 1.6,
        }}
      >
        {action.reasoning}
      </div>

      <div
        style={{
          marginTop: "14px",
          display: "inline-flex",
          alignItems: "center",
          padding: "4px 10px",
          borderRadius: "999px",
          backgroundColor: statusStyles.backgroundColor,
          color: statusStyles.color,
          fontSize: "12px",
          fontWeight: 700,
        }}
      >
        {statusStyles.label}
      </div>
    </article>
  );
}

function History() {
  const { user, loading } = useAuth();
  const [historyActions, setHistoryActions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    loadDocumentAssets({
      fonts: ["dmSans", "jetbrainsMono"],
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      if (!user) {
        return;
      }

      setHistoryLoading(true);
      setHistoryError("");

      try {
        const nextActions = await fetchHistoryActions(user.id);
        if (isMounted) {
          setHistoryActions(nextActions);
        }
      } catch (error) {
        console.error("Failed to fetch history actions", error);
        if (isMounted) {
          setHistoryError("Something went wrong. Try refreshing.");
          setHistoryActions([]);
        }
      } finally {
        if (isMounted) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const visibleActions = useMemo(() => {
    if (activeFilter === "Approved") {
      return historyActions.filter((action) => action.status === "approved");
    }

    if (activeFilter === "Dismissed") {
      return historyActions.filter((action) => action.status === "dismissed");
    }

    return historyActions;
  }, [activeFilter, historyActions]);

  if (loading) {
    return <HistoryShellMessage message="Checking your session..." />;
  }

  if (!user) {
    return null;
  }

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
        <h1
          style={{
            margin: "0 0 10px",
            color: palette.text,
            fontSize: "38px",
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: "-0.05em",
          }}
        >
          History
        </h1>
        <p
          style={{
            margin: "0 0 28px",
            color: palette.muted,
            fontSize: "15px",
            lineHeight: 1.7,
          }}
        >
          Every action your agent has taken.
        </p>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "32px",
            marginBottom: "28px",
          }}
        >
          {filterTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveFilter(tab)}
              style={{
                border: "none",
                borderBottom:
                  activeFilter === tab
                    ? `2px solid ${palette.blue}`
                    : "2px solid transparent",
                backgroundColor: "transparent",
                color: activeFilter === tab ? palette.text : palette.muted,
                padding: "0 0 10px",
                fontSize: "15px",
                fontWeight: 500,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {historyError ? (
          <div
            style={{
              marginBottom: "18px",
              color: "#e05252",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            {historyError}
          </div>
        ) : null}

        {historyLoading ? (
          <div
            style={{
              color: palette.muted,
              fontSize: "14px",
            }}
          >
            Loading history...
          </div>
        ) : visibleActions.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {visibleActions.map((action) => (
              <HistoryCard key={action.id} action={action} />
            ))}
          </div>
        ) : (
          <div
            style={{
              color: palette.muted,
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            {getEmptyStateMessage(activeFilter)}
          </div>
        )}
      </main>
    </div>
  );
}

export default History;
