import { useEffect, useMemo, useState } from "react";
import { fetchClients, generateAction, generateClientSummary } from "./dataLayer.js";
import { loadDocumentAssets } from "./documentAssets.js";
import { useAuth } from "./hooks/useAuth.js";
import { ACTION_PROMPT_MAX_LENGTH, sanitizePromptInput } from "./security.js";
import Sidebar from "./Sidebar.jsx";

const palette = {
  page: "#080c14",
  surface: "#0e1422",
  inset: "rgba(255,255,255,0.03)",
  border: "rgba(255,255,255,0.07)",
  borderActive: "rgba(79,142,247,0.3)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.45)",
  faint: "rgba(255,255,255,0.28)",
  blue: "#4f8ef7",
  blueSoft: "rgba(79,142,247,0.12)",
  green: "#34c759",
  greenSoft: "rgba(52,199,89,0.12)",
  amber: "#f5a623",
  amberSoft: "rgba(245,166,35,0.12)",
  red: "#e05252",
  redSoft: "rgba(224,82,82,0.12)",
};

const filterTabs = ["All", "Active", "Needs attention"];
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

function statusStyles(status) {
  switch (status) {
    case "Active":
      return { color: palette.green, backgroundColor: palette.greenSoft };
    case "Needs follow-up":
      return { color: palette.amber, backgroundColor: palette.amberSoft };
    case "Overdue":
      return { color: palette.red, backgroundColor: palette.redSoft };
    case "New lead":
    default:
      return { color: palette.blue, backgroundColor: palette.blueSoft };
  }
}

function needsAttention(status) {
  return status === "Needs follow-up" || status === "Overdue" || status === "New lead";
}

function isSummaryFresh(value) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return Date.now() - date.getTime() < ONE_DAY_IN_MS;
}

function ClientsShellMessage({ message }) {
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

function SummarySkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
      {[100, 92, 78].map((width) => (
        <div
          key={width}
          style={{
            width: `${width}%`,
            height: "12px",
            borderRadius: "999px",
            backgroundColor: "rgba(255,255,255,0.08)",
            animation: "olivander-shimmer 1.4s ease-in-out infinite",
          }}
        />
      ))}
    </div>
  );
}

function Clients() {
  const { user, loading } = useAuth();
  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [expandedId, setExpandedId] = useState(null);
  const [prompts, setPrompts] = useState({});
  const [requestStateById, setRequestStateById] = useState({});
  const [summaryRequestStateById, setSummaryRequestStateById] = useState({});

  useEffect(() => {
    loadDocumentAssets({
      fonts: ["dmSans", "jetbrainsMono"],
      styles: [
        {
          id: "olivander-clients-motion",
          css: `
        @keyframes olivander-shimmer {
          0% { opacity: 0.4; }
          50% { opacity: 0.8; }
          100% { opacity: 0.4; }
        }
      `,
        },
      ],
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadClients = async () => {
      if (!user) {
        return;
      }

      setClientsLoading(true);
      setClientsError("");

      try {
        const nextClients = await fetchClients(user.id);
        if (isMounted) {
          setClients(nextClients);
        }
      } catch (error) {
        console.error("Failed to fetch clients", error);
        if (isMounted) {
          setClientsError("Something went wrong. Try refreshing.");
          setClients([]);
        }
      } finally {
        if (isMounted) {
          setClientsLoading(false);
        }
      }
    };

    void loadClients();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const visibleClients = useMemo(() => {
    if (activeFilter === "Active") {
      return clients.filter((client) => client.status === "Active");
    }

    if (activeFilter === "Needs attention") {
      return clients.filter((client) => needsAttention(client.status));
    }

    return clients;
  }, [activeFilter, clients]);

  const mergeClientSummary = (clientId, summaryPayload) => {
    setClients((current) =>
      current.map((client) =>
        client.id === clientId
          ? {
              ...client,
              summary: summaryPayload.summary,
              summaryGeneratedAt: summaryPayload.summaryGeneratedAt,
            }
          : client,
      ),
    );
  };

  const toggleExpanded = (clientId) => {
    const isExpanding = expandedId !== clientId;
    const client = clients.find((item) => item.id === clientId);
    setExpandedId((current) => (current === clientId ? null : clientId));

    if (isExpanding && client) {
      void loadClientSummary(client);
    }
  };

  const setPrompt = (clientId, value) => {
    setPrompts((current) => ({ ...current, [clientId]: value }));
  };

  const setRequestState = (clientId, next) => {
    setRequestStateById((current) => ({ ...current, [clientId]: next }));
  };

  const setSummaryRequestState = (clientId, next) => {
    setSummaryRequestStateById((current) => ({ ...current, [clientId]: next }));
  };

  const loadClientSummary = async (client, options = {}) => {
    const force = options.force === true;
    const requestState = summaryRequestStateById[client.id];

    if (
      requestState?.status === "loading" ||
      requestState?.status === "refreshing" ||
      !user
    ) {
      return;
    }

    const hasSummary = Boolean(client.summary);
    const summaryIsFresh = isSummaryFresh(client.summaryGeneratedAt);

    if (!force && hasSummary && summaryIsFresh) {
      return;
    }

    setSummaryRequestState(client.id, {
      status: hasSummary ? "refreshing" : "loading",
    });

    try {
      const nextSummary = await generateClientSummary(client.id, { force });
      mergeClientSummary(client.id, nextSummary);
      setSummaryRequestState(client.id, { status: "idle" });
    } catch (error) {
      console.error("Failed to generate client summary", error);
      const message =
        error?.code === "missing-api-url"
          ? "The summary couldn't be generated. Add VITE_API_URL to .env and restart the app."
          : error?.message || "Something went wrong. Try refreshing.";
      setSummaryRequestState(client.id, { status: "error", message });
    }
  };

  const handleRegenerateSummary = async (event, client) => {
    event.preventDefault();
    event.stopPropagation();
    await loadClientSummary(client, { force: true });
  };

  const handleGenerateAction = async (event, client) => {
    event.preventDefault();
    const prompt = (prompts[client.id] || "").trim();

    if (!prompt || requestStateById[client.id]?.status === "loading" || !user) {
      return;
    }

    setRequestState(client.id, { status: "loading" });

    const clientContext = [
      `Client name: ${client.name}`,
      `Descriptor: ${client.descriptor}`,
      `Status: ${client.status}`,
      `Last contact: ${client.lastContact}`,
      `Agent notes: ${client.notes.join(" ")}`,
      `User request: ${prompt}`,
    ].join("\n");

    try {
      await generateAction(clientContext, {
        client_name: client.name,
        client_status: client.status,
      });
      setPrompt(client.id, "");
      setRequestState(client.id, { status: "success" });
      window.setTimeout(() => {
        setRequestState(client.id, { status: "idle" });
      }, 2200);
    } catch (error) {
      console.error("Failed to generate client action", error);
      const message =
        error?.code === "missing-api-url"
          ? "The agent couldn't generate an action. Add VITE_API_URL to .env and restart the app."
          : error?.message || "Something went wrong. Try refreshing.";
      setRequestState(client.id, { status: "error", message });
    }
  };

  if (loading) {
    return <ClientsShellMessage message="Checking your session..." />;
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
          Clients
        </h1>
        <p
          style={{
            margin: "0 0 28px",
            color: palette.muted,
            fontSize: "15px",
            lineHeight: 1.7,
          }}
        >
          Everyone your agent knows about.
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

        {clientsError ? (
          <div
            style={{
              marginBottom: "18px",
              color: "#e05252",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            {clientsError}
          </div>
        ) : null}

        {clientsLoading ? (
          <div
            style={{
              color: palette.muted,
              fontSize: "14px",
            }}
          >
            Loading clients...
          </div>
        ) : visibleClients.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {visibleClients.map((client) => {
              const expanded = expandedId === client.id;
              const statusStyle = statusStyles(client.status);
              const requestState = requestStateById[client.id] || { status: "idle" };
              const summaryRequestState = summaryRequestStateById[client.id] || {
                status: "idle",
              };
              const showSummarySkeleton =
                summaryRequestState.status === "loading" && !client.summary;
              const isSummaryRefreshing = summaryRequestState.status === "refreshing";

              return (
                <article
                  key={client.id}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  onClick={() => toggleExpanded(client.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggleExpanded(client.id);
                    }
                  }}
                  style={{
                    backgroundColor: palette.surface,
                    border: `1px solid ${expanded ? palette.borderActive : palette.border}`,
                    borderLeft: `3px solid ${expanded ? palette.blue : "transparent"}`,
                    borderRadius: "12px",
                    padding: "20px 24px",
                    boxSizing: "border-box",
                    cursor: "pointer",
                    transition:
                      "border-color 220ms ease, border-left-color 220ms ease, box-shadow 220ms ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "16px",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          marginBottom: "6px",
                          color: palette.text,
                          fontSize: "22px",
                          fontWeight: 700,
                          letterSpacing: "-0.03em",
                        }}
                      >
                        {client.name}
                      </div>
                      <div
                        style={{
                          marginBottom: "8px",
                          color: palette.muted,
                          fontSize: "14px",
                        }}
                      >
                        {client.descriptor}
                      </div>
                      <div
                        style={{
                          color: palette.faint,
                          fontSize: "12px",
                        }}
                      >
                        Last contact: {client.lastContact}
                      </div>
                    </div>

                    <div
                      style={{
                        ...statusStyle,
                        padding: "3px 10px",
                        borderRadius: "20px",
                        fontSize: "12px",
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {client.status}
                    </div>
                  </div>

                  <div
                    style={{
                      maxHeight: expanded ? "960px" : "0",
                      overflow: "hidden",
                      transition: "max-height 400ms cubic-bezier(0.4, 0, 0.2, 1)",
                    }}
                  >
                    <div
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                      style={{
                        marginTop: "20px",
                        paddingTop: "20px",
                        borderTop: `1px solid ${palette.border}`,
                      }}
                    >
                      <div
                        style={{
                          marginBottom: "20px",
                          padding: "18px",
                          borderRadius: "10px",
                          backgroundColor: palette.inset,
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
                            Relationship summary
                          </div>

                          <button
                            type="button"
                            disabled={
                              summaryRequestState.status === "loading" ||
                              summaryRequestState.status === "refreshing"
                            }
                            onClick={(event) => {
                              void handleRegenerateSummary(event, client);
                            }}
                            style={{
                              border: "none",
                              backgroundColor: "transparent",
                              color: palette.blue,
                              padding: 0,
                              fontSize: "13px",
                              fontWeight: 500,
                              fontFamily: "'DM Sans', sans-serif",
                              cursor:
                                summaryRequestState.status === "loading" ||
                                summaryRequestState.status === "refreshing"
                                  ? "default"
                                  : "pointer",
                              opacity:
                                summaryRequestState.status === "loading" ||
                                summaryRequestState.status === "refreshing"
                                  ? 0.7
                                  : 1,
                            }}
                          >
                            {isSummaryRefreshing ? "Refreshing..." : "Regenerate"}
                          </button>
                        </div>

                        {showSummarySkeleton ? (
                          <SummarySkeleton />
                        ) : client.summary ? (
                          <div
                            style={{
                              marginTop: "12px",
                              color: palette.muted,
                              fontSize: "14px",
                              lineHeight: 1.7,
                            }}
                          >
                            {client.summary}
                          </div>
                        ) : summaryRequestState.status === "error" ? (
                          <div
                            style={{
                              marginTop: "12px",
                              color: "#e05252",
                              fontSize: "13px",
                              lineHeight: 1.6,
                            }}
                          >
                            {summaryRequestState.message}
                          </div>
                        ) : (
                          <div
                            style={{
                              marginTop: "12px",
                              color: palette.muted,
                              fontSize: "13px",
                              lineHeight: 1.6,
                            }}
                          >
                            Generating a relationship summary...
                          </div>
                        )}

                        {summaryRequestState.status === "error" && client.summary ? (
                          <div
                            style={{
                              marginTop: "10px",
                              color: "#e05252",
                              fontSize: "12px",
                              lineHeight: 1.5,
                            }}
                          >
                            {summaryRequestState.message}
                          </div>
                        ) : null}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
                          gap: "20px",
                        }}
                      >
                        <div
                          style={{
                            padding: "18px",
                            borderRadius: "10px",
                            backgroundColor: palette.inset,
                          }}
                        >
                          <div
                            style={{
                              marginBottom: "12px",
                              color: palette.muted,
                              fontSize: "11px",
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            Agent notes
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                            {client.notes.map((note) => (
                              <div
                                key={note}
                                style={{
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: "10px",
                                  color: palette.muted,
                                  fontSize: "13px",
                                  lineHeight: 1.65,
                                }}
                              >
                                <span
                                  style={{
                                    width: "5px",
                                    height: "5px",
                                    marginTop: "8px",
                                    borderRadius: "999px",
                                    backgroundColor: palette.blue,
                                    flexShrink: 0,
                                  }}
                                />
                                <span>{note}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div
                          style={{
                            padding: "18px",
                            borderRadius: "10px",
                            backgroundColor: palette.inset,
                          }}
                        >
                          <div
                            style={{
                              marginBottom: "12px",
                              color: palette.muted,
                              fontSize: "11px",
                              fontWeight: 700,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            Recent interactions
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "9px",
                              color: palette.muted,
                              fontSize: "13px",
                              lineHeight: 1.65,
                            }}
                          >
                            {client.recentActions.map((item) => (
                              <div key={item}>{item}</div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div style={{ marginTop: "18px" }}>
                        <form
                          onSubmit={(event) => handleGenerateAction(event, client)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            padding: "10px",
                            borderRadius: "12px",
                            backgroundColor: palette.surface,
                            border: `1px solid ${palette.border}`,
                            boxShadow:
                              requestState.status === "loading"
                                ? `0 0 0 2px rgba(79,142,247,0.18)`
                                : "none",
                          }}
                        >
                          <div
                            style={{
                              color: palette.blue,
                              fontSize: "16px",
                              lineHeight: 1,
                              paddingLeft: "2px",
                            }}
                          >
                            ✦
                          </div>

                          <input
                            value={prompts[client.id] || ""}
                            onChange={(event) =>
                              setPrompt(client.id, sanitizePromptInput(event.target.value))
                            }
                            maxLength={ACTION_PROMPT_MAX_LENGTH}
                            placeholder={`Generate action for ${client.name}`}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              border: "none",
                              backgroundColor: "transparent",
                              color: palette.text,
                              padding: "8px 0",
                              fontSize: "14px",
                              fontFamily: "'DM Sans', sans-serif",
                              outline: "none",
                            }}
                          />

                          <button
                            type="submit"
                            disabled={requestState.status === "loading"}
                            style={{
                              border: `1px solid ${palette.blue}`,
                              backgroundColor: palette.blue,
                              color: "#080c14",
                              padding: "10px 14px",
                              borderRadius: "8px",
                              fontSize: "13px",
                              fontWeight: 700,
                              fontFamily: "'DM Sans', sans-serif",
                              cursor:
                                requestState.status === "loading" ? "default" : "pointer",
                              whiteSpace: "nowrap",
                              opacity: requestState.status === "loading" ? 0.8 : 1,
                            }}
                          >
                            {requestState.status === "loading" ? "Generating…" : "Generate"}
                          </button>
                        </form>

                        {requestState.status === "success" ? (
                          <div
                            style={{
                              marginTop: "10px",
                              color: palette.green,
                              fontSize: "13px",
                            }}
                          >
                            Added to your approval feed.
                          </div>
                        ) : null}

                        {requestState.status === "error" ? (
                          <div
                            style={{
                              marginTop: "10px",
                              color: "#e05252",
                              fontSize: "13px",
                              lineHeight: 1.6,
                            }}
                          >
                            {requestState.message}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              color: palette.muted,
              fontSize: "14px",
              lineHeight: 1.6,
            }}
          >
            No clients yet. Olivander will add them as it learns your inbox.
          </div>
        )}
      </main>
    </div>
  );
}

export default Clients;
