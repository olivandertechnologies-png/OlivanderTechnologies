import { useEffect, useMemo, useState } from "react";
import {
  completeOnboardingProfile,
  fetchOnboardingProfile,
  saveOnboardingProfile,
} from "./dataLayer.js";
import { loadDocumentAssets } from "./documentAssets.js";
import { useAuth } from "./hooks/useAuth.js";
import { navigate } from "./router.js";
import {
  CLIENT_COUNT_OPTIONS,
  DEFAULT_PROFILE,
  FOLLOW_UP_DELAY_OPTIONS,
  FOLLOW_UP_INVOICE_DELAY_OPTIONS,
  getOnboardingProfileFieldKey,
  ONBOARDING_PROFILE_FIELD_LIMITS,
  PROFILE_FIELD_LIMITS,
  sanitizeSettingsFieldValue,
  TONE_OPTIONS,
  TURNAROUND_OPTIONS,
} from "./security.js";

const TOTAL_STEPS = 5;

const palette = {
  page: "#080c14",
  surface: "#0e1422",
  border: "rgba(255,255,255,0.07)",
  field: "rgba(255,255,255,0.1)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.45)",
  faint: "rgba(255,255,255,0.12)",
  faintStrong: "rgba(255,255,255,0.2)",
  blue: "#4f8ef7",
  blueSoft: "rgba(79,142,247,0.16)",
};

const containerStyle = {
  width: "100%",
  maxWidth: "560px",
  display: "flex",
  flexDirection: "column",
  gap: "28px",
};

const labelStyle = {
  marginBottom: "8px",
  color: palette.muted,
  fontSize: "12px",
  fontWeight: 500,
};

const fieldStyle = {
  width: "100%",
  padding: "14px 16px",
  border: `1px solid ${palette.field}`,
  borderRadius: "10px",
  backgroundColor: palette.page,
  color: palette.text,
  fontSize: "15px",
  fontFamily: "'DM Sans', sans-serif",
  boxSizing: "border-box",
  outline: "none",
};

function isFilled(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getOnboardingProfileValue(settings, field) {
  const mappedField = getOnboardingProfileFieldKey(field);
  return settings.profile[mappedField] ?? "";
}

function isStepOneComplete(settings) {
  return (
    isFilled(settings.profile.name) &&
    isFilled(settings.profile.businessName) &&
    isFilled(getOnboardingProfileValue(settings, "what_you_do"))
  );
}

function isStepTwoComplete(settings) {
  return (
    isFilled(settings.profile.clientType) &&
    isFilled(settings.profile.clientCount) &&
    isFilled(settings.profile.clientSource)
  );
}

function isStepThreeComplete(settings) {
  return (
    isFilled(settings.behaviour.tone) &&
    isFilled(getOnboardingProfileValue(settings, "email_signoff"))
  );
}

function isStepFourComplete(settings) {
  return (
    isFilled(getOnboardingProfileValue(settings, "quote_turnaround")) &&
    isFilled(settings.behaviour.followUpDelay) &&
    isFilled(settings.behaviour.followUpInvoiceDelay)
  );
}

function getResumeStep(settings) {
  if (!isStepOneComplete(settings)) {
    return 1;
  }

  if (!isStepTwoComplete(settings)) {
    return 2;
  }

  if (!isStepThreeComplete(settings)) {
    return 3;
  }

  if (!isStepFourComplete(settings)) {
    return 4;
  }

  return 5;
}

function isCurrentStepReady(step, settings) {
  switch (step) {
    case 1:
      return isStepOneComplete(settings);
    case 2:
      return isStepTwoComplete(settings);
    case 3:
      return isStepThreeComplete(settings);
    case 4:
      return isStepFourComplete(settings);
    case 5:
      return true;
    default:
      return false;
  }
}

function OnboardingShellMessage({ message, actionLabel, onAction }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        boxSizing: "border-box",
        backgroundColor: palette.page,
        color: palette.text,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ color: palette.muted, fontSize: "14px" }}>{message}</div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            style={{
              marginTop: "18px",
              border: `1px solid ${palette.field}`,
              borderRadius: "10px",
              backgroundColor: palette.surface,
              color: palette.text,
              padding: "12px 16px",
              fontSize: "14px",
              fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
            }}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function StepTitle({ heading, description }) {
  return (
    <div>
      <h1
        style={{
          margin: 0,
          color: palette.text,
          fontSize: "34px",
          lineHeight: 1.1,
          letterSpacing: "-0.04em",
        }}
      >
        {heading}
      </h1>
      {description ? (
        <p
          style={{
            margin: "14px 0 0",
            color: palette.muted,
            fontSize: "15px",
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </label>
  );
}

function Onboarding() {
  const { user, loading } = useAuth();
  const [settings, setSettings] = useState(DEFAULT_PROFILE);
  const [currentStep, setCurrentStep] = useState(1);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    loadDocumentAssets({
      fonts: ["dmSans"],
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      if (!user) {
        return;
      }

      setIsProfileLoading(true);
      setLoadError("");

      try {
        const nextSettings = await fetchOnboardingProfile(user);
        if (!isMounted) {
          return;
        }

        setSettings(nextSettings);
        setCurrentStep(getResumeStep(nextSettings));
      } catch (error) {
        console.error("Failed to load onboarding profile", error);
        if (isMounted) {
          setLoadError("Something went wrong. Try again.");
        }
      } finally {
        if (isMounted) {
          setIsProfileLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [user, reloadKey]);

  const isCurrentStepComplete = useMemo(
    () => isCurrentStepReady(currentStep, settings),
    [currentStep, settings],
  );

  const updateField = (section, field, value) => {
    setSubmitError("");
    setSettings((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: sanitizeSettingsFieldValue(section, field, value),
      },
    }));
  };

  const updateOnboardingProfileField = (field, value) => {
    const mappedField = getOnboardingProfileFieldKey(field);
    updateField("profile", mappedField, value);
  };

  const handleNext = async () => {
    if (!user || !isCurrentStepComplete || isSavingStep || currentStep >= TOTAL_STEPS) {
      return;
    }

    setIsSavingStep(true);
    setSubmitError("");

    try {
      const nextSettings = await saveOnboardingProfile(user, settings);
      const resumeStep = getResumeStep(nextSettings);

      setSettings(nextSettings);
      setCurrentStep(Math.min(TOTAL_STEPS, Math.max(currentStep + 1, resumeStep)));
    } catch (error) {
      console.error("Failed to save onboarding step", error);
      setSubmitError(error?.message || "Something went wrong. Try again.");
    } finally {
      setIsSavingStep(false);
    }
  };

  const handleComplete = async () => {
    if (!user || isCompleting) {
      return;
    }

    setIsCompleting(true);
    setSubmitError("");

    try {
      const nextSettings = await completeOnboardingProfile(user);
      setSettings(nextSettings);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Failed to complete onboarding", error);
      setSubmitError(error?.message || "Something went wrong. Try again.");
      setIsCompleting(false);
    }
  };

  if (loading) {
    return <OnboardingShellMessage message="Loading your workspace..." />;
  }

  if (!user) {
    return <OnboardingShellMessage message="Redirecting you back to sign in..." />;
  }

  if (isProfileLoading) {
    return <OnboardingShellMessage message="Loading your onboarding..." />;
  }

  if (loadError) {
    return (
      <OnboardingShellMessage
        message={loadError}
        actionLabel="Try again"
        onAction={() => setReloadKey((current) => current + 1)}
      />
    );
  }

  const progressWidth = `${(currentStep / TOTAL_STEPS) * 100}%`;
  const isBusy = isSavingStep || isCompleting;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "104px 24px 40px",
        boxSizing: "border-box",
        backgroundColor: palette.page,
        color: palette.text,
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          position: "fixed",
          top: "28px",
          left: "28px",
          color: palette.text,
          fontSize: "16px",
          fontWeight: 600,
          letterSpacing: "-0.03em",
        }}
      >
        Olivander
      </div>

      <main
        style={{
          width: "100%",
          minHeight: "calc(100vh - 144px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={containerStyle}>
          <div>
            <div
              style={{
                height: "3px",
                width: "100%",
                borderRadius: "999px",
                backgroundColor: palette.faint,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: progressWidth,
                  height: "100%",
                  backgroundColor: palette.blue,
                  transition: "width 250ms ease",
                }}
              />
            </div>

            <div
              style={{
                marginTop: "12px",
                color: "rgba(255,255,255,0.4)",
                fontSize: "13px",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Step {currentStep} of {TOTAL_STEPS}
            </div>
          </div>

          <section
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "22px",
              padding: "36px",
              border: `1px solid ${palette.border}`,
              borderRadius: "18px",
              backgroundColor: palette.surface,
              boxSizing: "border-box",
              boxShadow: "0 30px 80px rgba(0, 0, 0, 0.28)",
            }}
          >
            {currentStep === 1 ? (
              <>
                <StepTitle heading="Let's start with the basics." />

                <Field label="Your name">
                  <input
                    value={settings.profile.name}
                    onChange={(event) =>
                      updateField("profile", "name", event.target.value)
                    }
                    maxLength={PROFILE_FIELD_LIMITS.name}
                    style={fieldStyle}
                  />
                </Field>

                <Field label="Business name">
                  <input
                    value={settings.profile.businessName}
                    onChange={(event) =>
                      updateField("profile", "businessName", event.target.value)
                    }
                    maxLength={PROFILE_FIELD_LIMITS.businessName}
                    style={fieldStyle}
                  />
                </Field>

                <Field label="What you do">
                  <input
                    value={getOnboardingProfileValue(settings, "what_you_do")}
                    onChange={(event) =>
                      updateOnboardingProfileField("what_you_do", event.target.value)
                    }
                    maxLength={ONBOARDING_PROFILE_FIELD_LIMITS.what_you_do}
                    placeholder="e.g. Plumber, personal trainer, consultant"
                    style={fieldStyle}
                  />
                </Field>
              </>
            ) : null}

            {currentStep === 2 ? (
              <>
                <StepTitle heading="Tell me about who you work with." />

                <Field label="Typical client type">
                  <input
                    value={settings.profile.clientType}
                    onChange={(event) =>
                      updateField("profile", "clientType", event.target.value)
                    }
                    maxLength={PROFILE_FIELD_LIMITS.clientType}
                    placeholder="e.g. Homeowners, small businesses, athletes"
                    style={fieldStyle}
                  />
                </Field>

                <Field label="Average number of active clients">
                  <select
                    value={settings.profile.clientCount}
                    onChange={(event) =>
                      updateField("profile", "clientCount", event.target.value)
                    }
                    style={fieldStyle}
                  >
                    <option value="">Select an option</option>
                    {CLIENT_COUNT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="How do most clients find you?">
                  <input
                    value={settings.profile.clientSource}
                    onChange={(event) =>
                      updateField("profile", "clientSource", event.target.value)
                    }
                    maxLength={PROFILE_FIELD_LIMITS.clientSource}
                    placeholder="e.g. Word of mouth, Instagram, Google"
                    style={fieldStyle}
                  />
                </Field>
              </>
            ) : null}

            {currentStep === 3 ? (
              <>
                <StepTitle heading="How do you like to come across?" />

                <div>
                  <div style={labelStyle}>Tone</div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: "10px",
                    }}
                  >
                    {TONE_OPTIONS.map((option) => {
                      const isSelected = settings.behaviour.tone === option;

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => updateField("behaviour", "tone", option)}
                          style={{
                            minHeight: "56px",
                            borderRadius: "999px",
                            border: `1px solid ${
                              isSelected ? palette.blue : palette.field
                            }`,
                            backgroundColor: isSelected
                              ? palette.blue
                              : palette.page,
                            color: isSelected ? "#080c14" : palette.text,
                            fontSize: "14px",
                            fontWeight: 600,
                            fontFamily: "'DM Sans', sans-serif",
                            cursor: "pointer",
                            transition:
                              "background-color 160ms ease, border-color 160ms ease, color 160ms ease",
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Field label="Email sign-off">
                  <input
                    value={getOnboardingProfileValue(settings, "email_signoff")}
                    onChange={(event) =>
                      updateOnboardingProfileField("email_signoff", event.target.value)
                    }
                    maxLength={ONBOARDING_PROFILE_FIELD_LIMITS.email_signoff}
                    placeholder="e.g. Cheers, James or Kind regards, Sarah"
                    style={fieldStyle}
                  />
                </Field>

                <Field label="Anything you never say in emails?">
                  <input
                    value={settings.profile.emailNeverSay}
                    onChange={(event) =>
                      updateField("profile", "emailNeverSay", event.target.value)
                    }
                    maxLength={PROFILE_FIELD_LIMITS.emailNeverSay}
                    placeholder="e.g. I never say 'per my last email'"
                    style={fieldStyle}
                  />
                </Field>
              </>
            ) : null}

            {currentStep === 4 ? (
              <>
                <StepTitle heading="A few things about how you run your business." />

                <Field label="Standard quote turnaround">
                  <select
                    value={getOnboardingProfileValue(settings, "quote_turnaround")}
                    onChange={(event) =>
                      updateOnboardingProfileField(
                        "quote_turnaround",
                        event.target.value,
                      )
                    }
                    style={fieldStyle}
                  >
                    <option value="">Select an option</option>
                    {TURNAROUND_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="How many days before you follow up on an unanswered quote?">
                  <select
                    value={settings.behaviour.followUpDelay}
                    onChange={(event) =>
                      updateField("behaviour", "followUpDelay", event.target.value)
                    }
                    style={fieldStyle}
                  >
                    <option value="">Select an option</option>
                    {FOLLOW_UP_DELAY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="How many days before you chase an unpaid invoice?">
                  <select
                    value={settings.behaviour.followUpInvoiceDelay}
                    onChange={(event) =>
                      updateField(
                        "behaviour",
                        "followUpInvoiceDelay",
                        event.target.value,
                      )
                    }
                    style={fieldStyle}
                  >
                    <option value="">Select an option</option>
                    {FOLLOW_UP_INVOICE_DELAY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : null}

            {currentStep === 5 ? (
              <>
                <StepTitle
                  heading="You're all set."
                  description="Olivander now knows enough to start working for you. You can update any of these details from settings at any time."
                />
              </>
            ) : null}

            {submitError ? (
              <div
                style={{
                  padding: "14px 16px",
                  border: `1px solid ${palette.faintStrong}`,
                  borderRadius: "10px",
                  backgroundColor: "rgba(255,255,255,0.04)",
                  color: palette.muted,
                  fontSize: "13px",
                  lineHeight: 1.6,
                }}
              >
                {submitError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={currentStep === TOTAL_STEPS ? handleComplete : handleNext}
              disabled={
                currentStep === TOTAL_STEPS
                  ? isCompleting
                  : !isCurrentStepComplete || isSavingStep
              }
              style={{
                width: "100%",
                border: "none",
                borderRadius: "12px",
                backgroundColor: "#ffffff",
                color: "#080c14",
                padding: "15px 18px",
                fontSize: "15px",
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                cursor:
                  currentStep === TOTAL_STEPS
                    ? isCompleting
                      ? "default"
                      : "pointer"
                    : !isCurrentStepComplete || isSavingStep
                      ? "default"
                      : "pointer",
                opacity:
                  currentStep === TOTAL_STEPS
                    ? isCompleting
                      ? 0.65
                      : 1
                    : !isCurrentStepComplete || isSavingStep
                      ? 0.45
                      : 1,
                transition: "opacity 160ms ease",
              }}
            >
              {currentStep === TOTAL_STEPS
                ? isCompleting
                  ? "Opening dashboard..."
                  : "Go to dashboard"
                : isBusy
                  ? "Saving..."
                  : "Next"}
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}

export default Onboarding;
