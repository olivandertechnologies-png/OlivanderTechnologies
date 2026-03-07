import { supabase } from "./supabase.js";

export const ACTION_PROMPT_MAX_LENGTH = 2000;
export const USER_CONTEXT_VALUE_MAX_LENGTH = 400;
export const USER_CONTEXT_MAX_ITEMS = 12;
export const PROFILE_FIELD_LIMITS = Object.freeze({
  name: 80,
  businessName: 120,
  work: 160,
  signoff: 80,
  turnaround: 60,
  role: 120,
  clientType: 160,
  clientSource: 160,
  emailNeverSay: 160,
});
export const TONE_OPTIONS = Object.freeze(["Friendly", "Professional", "Direct"]);
export const CLIENT_COUNT_OPTIONS = Object.freeze(["1-5", "6-15", "16-30", "30+"]);
export const TURNAROUND_OPTIONS = Object.freeze([
  "Same day",
  "1-2 days",
  "3-5 days",
  "1 week+",
]);
export const FOLLOW_UP_DELAY_OPTIONS = Object.freeze([
  "2 days",
  "3 days",
  "5 days",
  "1 week",
]);
export const FOLLOW_UP_INVOICE_DELAY_OPTIONS = Object.freeze([
  "On due date",
  "3 days after",
  "1 week after",
  "2 weeks after",
]);
export const GOOGLE_OAUTH_SCOPES = Object.freeze([
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
].join(" "));
export const GOOGLE_OAUTH_QUERY_PARAMS = Object.freeze({
  access_type: "offline",
  prompt: "consent",
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1"]);
const ALLOWED_TONES = new Set(TONE_OPTIONS);
const ALLOWED_CLIENT_COUNTS = new Set(CLIENT_COUNT_OPTIONS);
const ALLOWED_TURNAROUNDS = new Set(TURNAROUND_OPTIONS);
const ALLOWED_FOLLOW_UP_DELAYS = new Set(FOLLOW_UP_DELAY_OPTIONS);
const ALLOWED_FOLLOW_UP_INVOICE_DELAYS = new Set(FOLLOW_UP_INVOICE_DELAY_OPTIONS);
const LEGACY_FOLLOW_UP_DELAY_VALUES = new Map([
  ["After 2 days", "2 days"],
  ["After 3 days", "3 days"],
  ["After 5 days", "5 days"],
]);

export const DEFAULT_PROFILE = Object.freeze({
  onboardingComplete: false,
  profile: {
    name: "",
    businessName: "",
    work: "",
    signoff: "",
    turnaround: "",
    clientType: "",
    clientCount: "",
    clientSource: "",
    emailNeverSay: "",
  },
  behaviour: {
    tone: "",
    followUpDelay: "",
    followUpInvoiceDelay: "",
    weeklyDigestEnabled: true,
  },
  integrations: {
    calendarConnected: false,
  },
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnexpectedKeys(object, allowedKeys, label) {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`${label} contains an unsupported field.`);
    }
  }
}

function normalizeText(value, { maxLength, multiline = false }) {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.replace(/\r\n?/g, "\n");
  const cleaned = Array.from(normalized)
    .filter((char) => {
      if (char === "\n") {
        return multiline;
      }

      if (char === "\t") {
        return multiline;
      }

      return char >= " " && char !== "\u007f";
    })
    .join("");

  return cleaned.slice(0, maxLength);
}

function validateRequiredText(value, { label, maxLength, multiline = false }) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const cleaned = normalizeText(value, { maxLength, multiline });
  const trimmed = cleaned.trim();
  if (!trimmed) {
    throw new Error(`${label} must not be blank.`);
  }

  if (value.trim().length > maxLength || trimmed.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }

  return trimmed;
}

function validateOptionalText(value, { label, maxLength, multiline = false }) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  return normalizeText(value, { maxLength, multiline }).trim();
}

function normalizeLegacyFollowUpDelay(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();
  return LEGACY_FOLLOW_UP_DELAY_VALUES.get(trimmedValue) ?? trimmedValue;
}

function normalizeSelection(value, allowedValues, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmedValue = value.trim();
  return allowedValues.has(trimmedValue) ? trimmedValue : fallback;
}

export function sanitizePromptInput(value) {
  return normalizeText(value, {
    maxLength: ACTION_PROMPT_MAX_LENGTH,
    multiline: true,
  });
}

export function sanitizeProfileFieldInput(field, value) {
  const maxLength = PROFILE_FIELD_LIMITS[field];
  if (!maxLength) {
    throw new Error("Unsupported profile field.");
  }

  return normalizeText(value, { maxLength });
}

export function sanitizeSettingsFieldValue(section, field, value) {
  if (section === "profile" && field === "turnaround") {
    return normalizeSelection(value, ALLOWED_TURNAROUNDS, DEFAULT_PROFILE.profile.turnaround);
  }

  if (section === "profile" && field === "clientCount") {
    return normalizeSelection(
      value,
      ALLOWED_CLIENT_COUNTS,
      DEFAULT_PROFILE.profile.clientCount,
    );
  }

  if (section === "profile") {
    return sanitizeProfileFieldInput(field, value);
  }

  if (section === "behaviour" && field === "tone") {
    return normalizeSelection(value, ALLOWED_TONES, DEFAULT_PROFILE.behaviour.tone);
  }

  if (section === "behaviour" && field === "followUpDelay") {
    return normalizeSelection(
      normalizeLegacyFollowUpDelay(value),
      ALLOWED_FOLLOW_UP_DELAYS,
      DEFAULT_PROFILE.behaviour.followUpDelay,
    );
  }

  if (section === "behaviour" && field === "followUpInvoiceDelay") {
    return normalizeSelection(
      value,
      ALLOWED_FOLLOW_UP_INVOICE_DELAYS,
      DEFAULT_PROFILE.behaviour.followUpInvoiceDelay,
    );
  }

  if (section === "behaviour" && field === "weeklyDigestEnabled") {
    return Boolean(value);
  }

  if (section === "integrations" && field === "calendarConnected") {
    return Boolean(value);
  }

  throw new Error("Unsupported settings field.");
}

export function sanitizeSettingsInput(settings) {
  if (!isPlainObject(settings)) {
    throw new Error("Settings must be an object.");
  }

  rejectUnexpectedKeys(
    settings,
    ["onboardingComplete", "profile", "behaviour", "integrations"],
    "Settings",
  );

  const profile = isPlainObject(settings.profile) ? settings.profile : {};
  const behaviour = isPlainObject(settings.behaviour) ? settings.behaviour : {};
  const integrations = isPlainObject(settings.integrations) ? settings.integrations : {};

  rejectUnexpectedKeys(
    profile,
    [
      "name",
      "businessName",
      "work",
      "signoff",
      "turnaround",
      "clientType",
      "clientCount",
      "clientSource",
      "emailNeverSay",
    ],
    "Profile settings",
  );
  rejectUnexpectedKeys(
    behaviour,
    [
      "tone",
      "followUpDelay",
      "followUpInvoiceDelay",
      "weeklyDigestEnabled",
    ],
    "Behaviour settings",
  );
  rejectUnexpectedKeys(
    integrations,
    ["calendarConnected"],
    "Integration settings",
  );

  return {
    onboardingComplete: Boolean(settings.onboardingComplete),
    profile: {
      name: validateOptionalText(profile.name ?? "", {
        label: "Name",
        maxLength: PROFILE_FIELD_LIMITS.name,
      }),
      businessName: validateOptionalText(profile.businessName ?? "", {
        label: "Business name",
        maxLength: PROFILE_FIELD_LIMITS.businessName,
      }),
      work: validateOptionalText(profile.work ?? "", {
        label: "Work",
        maxLength: PROFILE_FIELD_LIMITS.work,
      }),
      signoff: validateOptionalText(profile.signoff ?? "", {
        label: "Sign-off",
        maxLength: PROFILE_FIELD_LIMITS.signoff,
      }),
      turnaround: normalizeSelection(
        profile.turnaround ?? "",
        ALLOWED_TURNAROUNDS,
        DEFAULT_PROFILE.profile.turnaround,
      ),
      clientType: validateOptionalText(profile.clientType ?? "", {
        label: "Typical client type",
        maxLength: PROFILE_FIELD_LIMITS.clientType,
      }),
      clientCount: normalizeSelection(
        profile.clientCount ?? "",
        ALLOWED_CLIENT_COUNTS,
        DEFAULT_PROFILE.profile.clientCount,
      ),
      clientSource: validateOptionalText(profile.clientSource ?? "", {
        label: "Client source",
        maxLength: PROFILE_FIELD_LIMITS.clientSource,
      }),
      emailNeverSay: validateOptionalText(profile.emailNeverSay ?? "", {
        label: "Email never say",
        maxLength: PROFILE_FIELD_LIMITS.emailNeverSay,
      }),
    },
    behaviour: {
      tone: normalizeSelection(
        behaviour.tone ?? "",
        ALLOWED_TONES,
        DEFAULT_PROFILE.behaviour.tone,
      ),
      followUpDelay: normalizeSelection(
        normalizeLegacyFollowUpDelay(behaviour.followUpDelay ?? ""),
        ALLOWED_FOLLOW_UP_DELAYS,
        DEFAULT_PROFILE.behaviour.followUpDelay,
      ),
      followUpInvoiceDelay: normalizeSelection(
        behaviour.followUpInvoiceDelay ?? "",
        ALLOWED_FOLLOW_UP_INVOICE_DELAYS,
        DEFAULT_PROFILE.behaviour.followUpInvoiceDelay,
      ),
      weeklyDigestEnabled:
        typeof behaviour.weeklyDigestEnabled === "boolean"
          ? behaviour.weeklyDigestEnabled
          : DEFAULT_PROFILE.behaviour.weeklyDigestEnabled,
    },
    integrations: {
      calendarConnected: Boolean(integrations.calendarConnected),
    },
  };
}

export function sanitizeUserContext(value) {
  if (!isPlainObject(value)) {
    throw new Error("User context must be an object.");
  }

  const entries = Object.entries(value);
  if (entries.length > USER_CONTEXT_MAX_ITEMS) {
    throw new Error(`User context must contain at most ${USER_CONTEXT_MAX_ITEMS} items.`);
  }

  return entries.reduce((sanitized, [key, item]) => {
    if (!/^[a-z0-9_.:-]{1,40}$/i.test(key)) {
      throw new Error("User context contains an invalid key.");
    }

    const cleaned = validateRequiredText(item, {
      label: `User context ${key}`,
      maxLength: USER_CONTEXT_VALUE_MAX_LENGTH,
      multiline: true,
    });

    sanitized[key] = cleaned;
    return sanitized;
  }, {});
}

export function sanitizeUuid(value, label = "Identifier") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a valid UUID.`);
  }

  return value.toLowerCase();
}

export function sanitizeActionStatus(status) {
  if (status !== "approved" && status !== "dismissed") {
    throw new Error("Unsupported action status.");
  }

  return status;
}

export function sanitizeApiBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Missing VITE_API_URL");
  }

  const url = new URL(value);
  const isLocalHttp =
    url.protocol === "http:" && LOCAL_API_HOSTS.has(url.hostname.toLowerCase());

  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("VITE_API_URL must use HTTPS outside local development.");
  }

  return url.toString().replace(/\/$/, "");
}

export async function getSessionAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    const sessionError = new Error("Please sign in again.");
    sessionError.code = "missing-session";
    throw sessionError;
  }

  return data.session.access_token;
}
