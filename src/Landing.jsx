import { useEffect, useRef, useState } from "react";
import { loadDocumentAssets } from "./documentAssets.js";
import { navigate } from "./router.js";
import { GOOGLE_OAUTH_QUERY_PARAMS, GOOGLE_OAUTH_SCOPES } from "./security.js";
import { supabase } from "./supabase.js";

const palette = {
  page: "#080c14",
  surface: "#0e1422",
  border: "rgba(255,255,255,0.07)",
  borderSoft: "rgba(255,255,255,0.06)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.45)",
  mutedStrong: "rgba(255,255,255,0.55)",
  blue: "#4f8ef7",
  blueSoft: "rgba(79,142,247,0.12)",
  blueBorder: "rgba(79,142,247,0.4)",
};

const cards = [
  {
    code: "EM",
    title: "Reads your inbox",
    description:
      "Every email that comes in gets read, understood, and acted on. Olivander knows your clients, your history with them, and what a response should look like — then drafts it in your voice.",
  },
  {
    code: "QU",
    title: "Follows up on quotes",
    description:
      "When a quote goes unanswered, Olivander notices. It knows how long is too long for your business and surfaces a follow-up at exactly the right moment — ready to send with one tap.",
  },
  {
    code: "IN",
    title: "Chases invoices",
    description:
      "Outstanding payments don't slip through. Olivander tracks what's overdue, writes a professional reminder, and brings it to you to approve. You stop losing money to invoices you forgot to chase.",
  },
  {
    code: "SC",
    title: "Handles scheduling",
    description:
      "A client wants to meet. You tell Olivander or it reads the request itself — either way it handles the back-and-forth, finds the time, and prepares the invite.",
  },
];

const demoMessages = [
  {
    speaker: "OL",
    text: "I found 3 things that need your attention this morning.",
  },
  {
    speaker: "OL",
    text: "Sarah Chen hasn't replied to your quote from Tuesday. I've drafted a follow-up.",
  },
  {
    speaker: "JM",
    text: "Looks good — send it.",
  },
  {
    speaker: "OL",
    text: "Done. Mike Robinson's invoice is 14 days overdue. Want me to chase it?",
  },
  {
    speaker: "JM",
    text: "Yes, send the standard reminder.",
  },
  {
    speaker: "OL",
    text: "Sent. All clear for now — I'll flag anything new as it comes in.",
  },
];

function staggeredStyle(isVisible, index, baseStyle = {}) {
  return {
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? "translateY(0)" : "translateY(24px)",
    transition: `opacity 600ms ease ${index * 100}ms, transform 600ms ease ${index * 100}ms`,
    ...baseStyle,
  };
}

function RevealSection({ children, style }) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.16 },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} style={style}>
      {children(isVisible)}
    </section>
  );
}

function Landing() {
  const [heroVisible, setHeroVisible] = useState(false);
  const [authError, setAuthError] = useState("");
  const [demoStep, setDemoStep] = useState(0);
  const [isDemoFading, setIsDemoFading] = useState(false);
  const demoScrollRef = useRef(null);

  useEffect(() => {
    loadDocumentAssets({
      fonts: ["dmSans", "jetbrainsMono"],
      styles: [
        {
          id: "olivander-landing-effects",
          css: `
        @keyframes olivander-hero-glow {
          0% { opacity: 0.55; transform: translateX(-50%) scale(0.97); }
          50% { opacity: 1; transform: translateX(-50%) scale(1.03); }
          100% { opacity: 0.55; transform: translateX(-50%) scale(0.97); }
        }

        @keyframes olivander-message-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .olivander-modal-input::placeholder {
          color: rgba(255,255,255,0.32);
        }
      `,
        },
      ],
    });

    const frame = window.requestAnimationFrame(() => {
      setHeroVisible(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (isMounted && data.session) {
          navigate("/dashboard", { replace: true });
        }
      } catch (error) {
        console.error("Failed to check Supabase session", error);
      }
    };

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let timeoutId;
    let cancelled = false;

    const runLoop = (step) => {
      if (cancelled) {
        return;
      }

      if (step <= demoMessages.length) {
        setDemoStep(step);
        timeoutId = window.setTimeout(() => runLoop(step + 1), 1200);
        return;
      }

      timeoutId = window.setTimeout(() => {
        setIsDemoFading(true);
        timeoutId = window.setTimeout(() => {
          setDemoStep(0);
          setIsDemoFading(false);
          timeoutId = window.setTimeout(() => runLoop(1), 320);
        }, 400);
      }, 2000);
    };

    runLoop(1);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const node = demoScrollRef.current;
    if (!node) {
      return;
    }

    if (demoStep === 0) {
      node.scrollTop = 0;
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [demoStep]);

  const handleSignIn = async (event) => {
    event?.preventDefault();
    setAuthError("");

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: GOOGLE_OAUTH_SCOPES,
          queryParams: GOOGLE_OAUTH_QUERY_PARAMS,
        },
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error("Failed to start Google sign-in", error);
      setAuthError("Something went wrong. Try refreshing.");
    }
  };

  const visibleMessages = demoMessages.slice(0, demoStep);

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
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          width: "100%",
          borderBottom: `1px solid ${palette.borderSoft}`,
          background: "rgba(8,12,20,0.8)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div
          style={{
            width: "100%",
            padding: "0 48px",
            height: "72px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxSizing: "border-box",
          }}
        >
          <a
            href="/"
            style={{
              color: palette.text,
              textDecoration: "none",
              fontSize: "20px",
              fontWeight: 600,
              letterSpacing: "-0.03em",
            }}
          >
            Olivander
          </a>

          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <button
              type="button"
              onClick={handleSignIn}
              style={{
                color: palette.muted,
                textDecoration: "none",
                fontSize: "14px",
                fontWeight: 500,
                border: "none",
                backgroundColor: "transparent",
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={handleSignIn}
              style={{
                border: "none",
                borderRadius: "999px",
                backgroundColor: "#ffffff",
                color: palette.page,
                padding: "11px 18px",
                fontSize: "14px",
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer",
              }}
            >
              Join waitlist
            </button>
          </div>
        </div>
      </header>

      {authError ? (
        <div
          style={{
            padding: "12px 48px 0",
            color: palette.muted,
            fontSize: "13px",
            textAlign: "right",
          }}
        >
          {authError}
        </div>
      ) : null}

      <main>
        <section
          style={{
            position: "relative",
            padding: "140px 48px 88px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: "44px",
              width: "760px",
              height: "190px",
              transform: "translateX(-50%)",
              background:
                "radial-gradient(ellipse 50% 30% at 50% 100%, rgba(79,142,247,0.12), transparent)",
              pointerEvents: "none",
              animation: "olivander-hero-glow 4s ease-in-out infinite",
            }}
          />

          <div
            style={{
              maxWidth: "900px",
              margin: "0 auto",
              textAlign: "center",
              position: "relative",
              zIndex: 1,
            }}
          >
            <div
              style={staggeredStyle(heroVisible, 0, {
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "28px",
                padding: "4px 14px",
                borderRadius: "20px",
                border: `1px solid ${palette.blueBorder}`,
                color: palette.blue,
                fontSize: "12px",
                fontWeight: 500,
              })}
            >
              Now accepting early access applications
            </div>

            <h1
              style={staggeredStyle(heroVisible, 1, {
                margin: "0 auto",
                maxWidth: "820px",
                color: palette.text,
                fontSize: "80px",
                fontWeight: 700,
                letterSpacing: "-3px",
                lineHeight: 1.05,
              })}
            >
              <span style={{ display: "block" }}>Your business has</span>
              <span style={{ display: "block" }}>an office manager now.</span>
            </h1>

            <p
              style={staggeredStyle(heroVisible, 2, {
                margin: "28px auto 0",
                maxWidth: "480px",
                color: palette.mutedStrong,
                fontSize: "18px",
                lineHeight: 1.65,
              })}
            >
              Olivander runs in the background of your business — reading
              emails, managing follow-ups, chasing invoices, handling
              scheduling. Tell it what needs doing or let it figure it out.
              Every action waits for your approval before anything fires.
            </p>

            <div
              style={staggeredStyle(heroVisible, 3, {
                marginTop: "34px",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                justifyContent: "center",
                gap: "12px",
                width: "100%",
                maxWidth: "360px",
                marginLeft: "auto",
                marginRight: "auto",
              })}
            >
              <button
                type="button"
                onClick={handleSignIn}
                style={{
                  border: "none",
                  borderRadius: "10px",
                  backgroundColor: "#ffffff",
                  color: palette.page,
                  padding: "15px 22px",
                  fontSize: "15px",
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Create your account
              </button>

              <div
                style={{
                  color: palette.muted,
                  fontSize: "14px",
                  fontWeight: 500,
                  textAlign: "center",
                }}
              >
                or
              </div>

              <button
                type="button"
                onClick={handleSignIn}
                style={{
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: "10px",
                  backgroundColor: "transparent",
                  color: palette.text,
                  padding: "15px 22px",
                  fontSize: "15px",
                  fontWeight: 700,
                  fontFamily: "'DM Sans', sans-serif",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Sign in
              </button>

              <div
                style={{
                  marginTop: "2px",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "13px",
                  fontFamily: "'DM Sans', sans-serif",
                  lineHeight: 1.5,
                  textAlign: "center",
                }}
              >
                We use Google to verify your identity. Your Olivander account is separate.
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            borderTop: `1px solid ${palette.borderSoft}`,
            borderBottom: `1px solid ${palette.borderSoft}`,
            padding: "16px 48px",
          }}
        >
          <div
            style={{
              maxWidth: "1200px",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
              flexWrap: "wrap",
              color: palette.muted,
              fontSize: "13px",
            }}
          >
            <span>Built for NZ sole traders</span>
            <span>·</span>
            <span>No credit card required</span>
            <span>·</span>
            <span>Cancel any time</span>
          </div>
        </section>

        <RevealSection style={{ padding: "112px 48px 32px" }}>
          {(isVisible) => (
            <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
              <h2
                style={staggeredStyle(isVisible, 0, {
                  margin: 0,
                  color: palette.text,
                  fontSize: "44px",
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                })}
              >
                Everything you hate doing.
              </h2>
              <p
                style={staggeredStyle(isVisible, 1, {
                  margin: "14px 0 0",
                  maxWidth: "620px",
                  color: palette.muted,
                  fontSize: "18px",
                  lineHeight: 1.6,
                })}
              >
                The back-and-forth that eats your day. Olivander takes it off
                your plate.
              </p>

              <div
                style={staggeredStyle(isVisible, 2, {
                  marginTop: "40px",
                  display: "flex",
                  gap: "18px",
                  overflowX: "auto",
                  paddingBottom: "8px",
                })}
              >
                {cards.map((card) => (
                  <article
                    key={card.code}
                    style={{
                      flex: "1 1 0",
                      minWidth: "250px",
                      backgroundColor: palette.surface,
                      border: `1px solid ${palette.border}`,
                      borderRadius: "16px",
                      padding: "32px 28px",
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginBottom: "22px",
                        borderRadius: "10px",
                        backgroundColor: "rgba(255,255,255,0.03)",
                        color: "rgba(79,142,247,0.6)",
                        fontSize: "11px",
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 500,
                        letterSpacing: "0.08em",
                      }}
                    >
                      {card.code}
                    </div>

                    <div
                      style={{
                        marginBottom: "12px",
                        color: palette.text,
                        fontSize: "18px",
                        fontWeight: 700,
                      }}
                    >
                      {card.title}
                    </div>

                    <div
                      style={{
                        color: palette.muted,
                        fontSize: "14px",
                        lineHeight: 1.6,
                      }}
                    >
                      {card.description}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </RevealSection>

        <RevealSection style={{ padding: "88px 48px 32px" }}>
          {(isVisible) => (
            <div
              style={{
                maxWidth: "1200px",
                margin: "0 auto",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "40px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: "1 1 480px", maxWidth: "560px" }}>
                <h2
                  style={staggeredStyle(isVisible, 0, {
                    margin: 0,
                    color: palette.text,
                    fontSize: "44px",
                    fontWeight: 700,
                    letterSpacing: "-0.04em",
                  })}
                >
                  Simple by design.
                </h2>

                <div
                  style={staggeredStyle(isVisible, 1, {
                    marginTop: "36px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "28px",
                  })}
                >
                  {[
                    {
                      number: "01",
                      text:
                        "Olivander connects to your inbox and reads what's coming in. It knows your clients, your history with them, and what still needs a response.",
                    },
                    {
                      number: "02",
                      text:
                        "When something needs attention it prepares the action — a follow-up email, an invoice reminder, a meeting invite. You can also tell it directly what needs doing in plain language.",
                    },
                    {
                      number: "03",
                      text:
                        "Everything waits for your approval. Nothing reaches a client until you tap approve. Clear your entire queue in minutes.",
                    },
                  ].map((step) => (
                    <div
                      key={step.number}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "54px 1fr",
                        gap: "18px",
                        alignItems: "start",
                      }}
                    >
                      <div
                        style={{
                          color: palette.blue,
                          fontSize: "28px",
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >
                        {step.number}
                      </div>
                      <div
                        style={{
                          color: palette.text,
                          fontSize: "18px",
                          lineHeight: 1.7,
                        }}
                      >
                        {step.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ flex: "1 1 420px", maxWidth: "520px", width: "100%" }}>
                <div style={staggeredStyle(isVisible, 2)}>
                  <div
                    style={{
                      marginBottom: "14px",
                      color: palette.muted,
                      fontSize: "12px",
                      fontWeight: 500,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                    }}
                  >
                    Your morning queue
                  </div>

                  <div
                    style={{
                      height: "380px",
                      overflow: "hidden",
                      background: palette.surface,
                      border: `1px solid ${palette.border}`,
                      borderRadius: "16px",
                      boxSizing: "border-box",
                      display: "flex",
                      flexDirection: "column",
                    }}
                  >
                    <div
                      style={{
                        height: "40px",
                        background: "#0a0e1a",
                        borderRadius: "16px 16px 0 0",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        display: "flex",
                        alignItems: "center",
                        padding: "0 16px",
                        gap: "8px",
                        flexShrink: 0,
                      }}
                    >
                      {["#ff5f57", "#febc2e", "#28c840"].map((color) => (
                        <div
                          key={color}
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "50%",
                            background: color,
                          }}
                        />
                      ))}
                    </div>

                    <div
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        boxSizing: "border-box",
                        padding: "20px",
                      }}
                    >
                      <div
                        ref={demoScrollRef}
                        style={{
                          height: "100%",
                          overflowY: "auto",
                          boxSizing: "border-box",
                          transition: "opacity 400ms ease",
                          opacity: isDemoFading ? 0 : 1,
                        }}
                      >
                        <div
                          style={{
                            minHeight: "100%",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                          }}
                        >
                          {visibleMessages.map((message, index) => {
                            const isAgent = message.speaker === "OL";

                            return (
                              <div
                                key={`${message.speaker}-${index}`}
                                style={{
                                  display: "flex",
                                  justifyContent: isAgent ? "flex-start" : "flex-end",
                                  opacity: 0,
                                  transform: "translateY(8px)",
                                  animation: "olivander-message-in 300ms ease forwards",
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: isAgent ? "row" : "row-reverse",
                                    alignItems: "flex-start",
                                    gap: "10px",
                                    maxWidth: "86%",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: "24px",
                                      height: "24px",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      borderRadius: "999px",
                                      flexShrink: 0,
                                      backgroundColor: isAgent
                                        ? "rgba(79,142,247,0.15)"
                                        : "rgba(255,255,255,0.07)",
                                      color: isAgent ? palette.blue : palette.muted,
                                      fontSize: "10px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {message.speaker}
                                  </div>

                                  <div
                                    style={{
                                      padding: "10px 14px",
                                      borderRadius: isAgent
                                        ? "14px 14px 14px 4px"
                                        : "14px 14px 4px 14px",
                                      backgroundColor: isAgent ? "#1a2035" : "#1e3a5f",
                                      border: "none",
                                      color: "rgba(255,255,255,0.85)",
                                      fontSize: "13px",
                                      lineHeight: 1.5,
                                      textAlign: isAgent ? "left" : "right",
                                    }}
                                  >
                                    {message.text}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </RevealSection>

        <RevealSection style={{ padding: "120px 48px" }}>
          {(isVisible) => (
            <div style={{ maxWidth: "900px", margin: "0 auto", textAlign: "center" }}>
              <div
                style={staggeredStyle(isVisible, 0, {
                  color: palette.muted,
                  fontSize: "13px",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                })}
              >
                Straightforward pricing
              </div>

              <div
                style={staggeredStyle(isVisible, 1, {
                  marginTop: "18px",
                })}
              >
                <div style={{ textAlign: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "center",
                      gap: "8px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "96px",
                        fontWeight: 700,
                        color: "#ffffff",
                        lineHeight: 1,
                        fontFamily: "DM Sans",
                      }}
                    >
                      $49
                    </span>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "20px",
                          fontWeight: 600,
                          color: "rgba(255,255,255,0.9)",
                          fontFamily: "DM Sans",
                        }}
                      >
                        NZD
                      </span>
                      <span
                        style={{
                          fontSize: "14px",
                          color: "rgba(255,255,255,0.4)",
                          fontFamily: "DM Sans",
                        }}
                      >
                        per month
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <p
                style={staggeredStyle(isVisible, 2, {
                  margin: "20px auto 0",
                  maxWidth: "520px",
                  color: palette.muted,
                  fontSize: "18px",
                  lineHeight: 1.65,
                })}
              >
                One price. No tiers. No per-seat fees. Cancel any time.
              </p>

              <div style={staggeredStyle(isVisible, 3, { marginTop: "30px" })}>
                <button
                  type="button"
                  onClick={handleSignIn}
                  style={{
                    border: "none",
                    borderRadius: "10px",
                    backgroundColor: "#ffffff",
                    color: palette.page,
                    padding: "15px 22px",
                    fontSize: "15px",
                    fontWeight: 700,
                    fontFamily: "'DM Sans', sans-serif",
                    cursor: "pointer",
                  }}
                >
                  Join waitlist
                </button>
              </div>
            </div>
          )}
        </RevealSection>
      </main>

      <footer
        style={{
          borderTop: `1px solid ${palette.borderSoft}`,
          padding: "24px 48px",
        }}
      >
        <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "18px",
            flexWrap: "wrap",
            color: palette.muted,
            fontSize: "13px",
          }}
        >
          <div>© 2026 Olivander Technologies Ltd.</div>
          <div>Built in Queenstown, New Zealand</div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
