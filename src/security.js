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
});

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1"]);
const ALLOWED_TONES = new Set(["Professional", "Friendly", "Direct"]);
const ALLOWED_FOLLOW_UP_DELAYS = new Set([
  "After 2 days",
  "After 3 days",
  "After 5 days",
]);

export const DEFAULT_PROFILE = Object.freeze({
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
    .join("")
    .trim();

  return cleaned.slice(0, maxLength);
}

function validateRequiredText(value, { label, maxLength, multiline = false }) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  const cleaned = normalizeText(value, { maxLength, multiline });
  if (!cleaned) {
    throw new Error(`${label} must not be blank.`);
  }

  if (value.trim().length > maxLength || cleaned.length > maxLength) {
    throw new Error(`${label} must be at most ${maxLength} characters.`);
  }

  return cleaned;
}

function validateOptionalText(value, { label, maxLength, multiline = false }) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }

  return normalizeText(value, { maxLength, multiline });
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
  if (section === "profile") {
    return sanitizeProfileFieldInput(field, value);
  }

  if (section === "behaviour" && field === "tone") {
    return ALLOWED_TONES.has(value) ? value : DEFAULT_PROFILE.behaviour.tone;
  }

  if (section === "behaviour" && field === "followUpDelay") {
    return ALLOWED_FOLLOW_UP_DELAYS.has(value)
      ? value
      : DEFAULT_PROFILE.behaviour.followUpDelay;
  }

  if (section === "behaviour" && field === "autoDismissLowPriority") {
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

  rejectUnexpectedKeys(settings, ["profile", "behaviour", "integrations"], "Settings");

  const profile = isPlainObject(settings.profile) ? settings.profile : {};
  const behaviour = isPlainObject(settings.behaviour) ? settings.behaviour : {};
  const integrations = isPlainObject(settings.integrations) ? settings.integrations : {};

  rejectUnexpectedKeys(
    profile,
    ["name", "businessName", "work", "signoff", "turnaround"],
    "Profile settings",
  );
  rejectUnexpectedKeys(
    behaviour,
    ["tone", "followUpDelay", "autoDismissLowPriority"],
    "Behaviour settings",
  );
  rejectUnexpectedKeys(
    integrations,
    ["calendarConnected"],
    "Integration settings",
  );

  return {
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
      turnaround: validateOptionalText(profile.turnaround ?? "", {
        label: "Turnaround",
        maxLength: PROFILE_FIELD_LIMITS.turnaround,
      }),
    },
    behaviour: {
      tone: ALLOWED_TONES.has(behaviour.tone)
        ? behaviour.tone
        : DEFAULT_PROFILE.behaviour.tone,
      followUpDelay: ALLOWED_FOLLOW_UP_DELAYS.has(behaviour.followUpDelay)
        ? behaviour.followUpDelay
        : DEFAULT_PROFILE.behaviour.followUpDelay,
      autoDismissLowPriority: Boolean(behaviour.autoDismissLowPriority),
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
