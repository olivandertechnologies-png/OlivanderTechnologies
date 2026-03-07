import { supabase } from "./supabase.js";
import {
  DEFAULT_PROFILE,
  getSessionAccessToken,
  sanitizeActionStatus,
  sanitizeApiBaseUrl,
  sanitizePromptInput,
  sanitizeSettingsInput,
  sanitizeUserContext,
  sanitizeUuid,
} from "./security.js";

export { DEFAULT_PROFILE } from "./security.js";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

const SEEDED_CLIENTS = [
  {
    name: "Sarah Chen",
    descriptor: "New lead · Referred by Mike R.",
    last_contact: "3 days ago",
    status: "Needs follow-up",
    notes: [
      "Quote request is still unanswered.",
      "Budget is approximately $2,400.",
      "Prefers email over calls.",
    ],
    recent_actions: [
      "3 days ago — Sent quote request through website form",
      "4 days ago — Mentioned referral from Mike R.",
      "5 days ago — Asked for an estimate on bathroom plumbing work",
    ],
  },
  {
    name: "Mike Robinson",
    descriptor: "Repeat client",
    last_contact: "14 days ago",
    status: "Overdue",
    notes: [
      "Invoice #0042 is outstanding for $1,840.",
      "Historically a slow payer.",
      "Relationship is still strong.",
    ],
    recent_actions: [
      "14 days ago — Invoice #0042 sent",
      "3 weeks ago — Job completed and signed off",
      "6 weeks ago — Approved additional drainage work",
    ],
  },
  {
    name: "Lena Park",
    descriptor: "Active client",
    last_contact: "1 day ago",
    status: "Active",
    notes: [
      "Site visit is confirmed for Tuesday.",
      "Has referred two other clients.",
      "High-value ongoing work.",
    ],
    recent_actions: [
      "1 day ago — Confirmed site visit details",
      "4 days ago — Shared updated scope and pricing",
      "1 week ago — Requested a Tuesday afternoon slot",
    ],
  },
  {
    name: "Tony Hira",
    descriptor: "Active client",
    last_contact: "today",
    status: "Active",
    notes: [
      "Scheduling is confirmed.",
      "No outstanding items.",
      "Current job is tracking on time.",
    ],
    recent_actions: [
      "Today — Confirmed tomorrow's arrival window",
      "2 days ago — Shared revised install timing",
      "5 days ago — Approved fixture selection",
    ],
  },
  {
    name: "Petra Vogt",
    descriptor: "Past client",
    last_contact: "6 weeks ago",
    status: "New lead",
    notes: [
      "Enquired about a maintenance contract.",
      "No quote has been sent yet.",
      "Potential for recurring work.",
    ],
    recent_actions: [
      "6 weeks ago — Asked about ongoing maintenance options",
      "7 weeks ago — Mentioned prior positive experience",
      "3 months ago — Last completed job closed out",
    ],
  },
];

const bootstrappedUsers = new Set();
const bootstrapPromises = new Map();

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function mapActionSteps(value) {
  return ensureArray(value)
    .filter((step) => typeof step === "string")
    .map((step) => step.trim())
    .filter(Boolean);
}

function mapActionConfidence(value) {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return null;
}

function mapActionPriorityScore(value) {
  const parsedValue = Number(value);

  if (Number.isInteger(parsedValue) && parsedValue >= 1 && parsedValue <= 10) {
    return parsedValue;
  }

  return 0;
}

function mapOptionalText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function mapOptionalTimestamp(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function getApiBaseUrl() {
  try {
    return sanitizeApiBaseUrl(API_BASE_URL);
  } catch (error) {
    error.code = "missing-api-url";
    throw error;
  }
}

function getFullName(user) {
  const rawName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    "";

  return typeof rawName === "string" ? rawName.trim().slice(0, 80) : "";
}

function buildUserPayload(user, settings = DEFAULT_PROFILE) {
  const sanitizedSettings = sanitizeSettingsInput(settings);

  return {
    id: sanitizeUuid(user.id, "User ID"),
    email: user.email ?? null,
    name: sanitizedSettings.profile.name || getFullName(user) || null,
    business_name: sanitizedSettings.profile.businessName || null,
    work: sanitizedSettings.profile.work || null,
    signoff: sanitizedSettings.profile.signoff || null,
    turnaround: sanitizedSettings.profile.turnaround || null,
    client_type: sanitizedSettings.profile.clientType || null,
    client_count: sanitizedSettings.profile.clientCount || null,
    client_source: sanitizedSettings.profile.clientSource || null,
    email_never_say: sanitizedSettings.profile.emailNeverSay || null,
    tone: sanitizedSettings.behaviour.tone || null,
    follow_up_delay: sanitizedSettings.behaviour.followUpDelay || null,
    followup_invoice_delay:
      sanitizedSettings.behaviour.followUpInvoiceDelay || null,
    weekly_digest_enabled:
      typeof sanitizedSettings.behaviour.weeklyDigestEnabled === "boolean"
        ? sanitizedSettings.behaviour.weeklyDigestEnabled
        : null,
    calendar_connected:
      typeof sanitizedSettings.integrations.calendarConnected === "boolean"
        ? sanitizedSettings.integrations.calendarConnected
        : null,
    onboarding_complete:
      typeof sanitizedSettings.onboardingComplete === "boolean"
        ? sanitizedSettings.onboardingComplete
        : false,
  };
}

function normalizeProfileRow(row, user) {
  const fallbackName = getFullName(user);

  return sanitizeSettingsInput({
    onboardingComplete: Boolean(row?.onboarding_complete),
    profile: {
      name: row?.name || fallbackName,
      businessName: row?.business_name || "",
      work: row?.work || "",
      signoff: row?.signoff || "",
      turnaround: row?.turnaround || "",
      clientType: row?.client_type || "",
      clientCount: row?.client_count || "",
      clientSource: row?.client_source || "",
      emailNeverSay: row?.email_never_say || "",
    },
    behaviour: {
      tone: row?.tone || DEFAULT_PROFILE.behaviour.tone,
      followUpDelay:
        row?.follow_up_delay || DEFAULT_PROFILE.behaviour.followUpDelay,
      followUpInvoiceDelay:
        row?.followup_invoice_delay ||
        DEFAULT_PROFILE.behaviour.followUpInvoiceDelay,
      weeklyDigestEnabled:
        typeof row?.weekly_digest_enabled === "boolean"
          ? row.weekly_digest_enabled
          : DEFAULT_PROFILE.behaviour.weeklyDigestEnabled,
    },
    integrations: {
      calendarConnected: Boolean(row?.calendar_connected),
    },
  });
}

function normalizeOnboardingRow(row, user) {
  const fallbackName = getFullName(user);

  return sanitizeSettingsInput({
    onboardingComplete: Boolean(row?.onboarding_complete),
    profile: {
      name: row?.name || fallbackName,
      businessName: row?.business_name || "",
      work: row?.work || "",
      signoff: row?.signoff || "",
      turnaround: row?.turnaround || "",
      clientType: row?.client_type || "",
      clientCount: row?.client_count || "",
      clientSource: row?.client_source || "",
      emailNeverSay: row?.email_never_say || "",
    },
    behaviour: {
      tone: row?.tone || DEFAULT_PROFILE.behaviour.tone,
      followUpDelay:
        row?.follow_up_delay || DEFAULT_PROFILE.behaviour.followUpDelay,
      followUpInvoiceDelay:
        row?.followup_invoice_delay ||
        DEFAULT_PROFILE.behaviour.followUpInvoiceDelay,
      weeklyDigestEnabled: DEFAULT_PROFILE.behaviour.weeklyDigestEnabled,
    },
    integrations: DEFAULT_PROFILE.integrations,
  });
}

function buildOnboardingPayload(user, settings = DEFAULT_PROFILE) {
  const sanitizedSettings = sanitizeSettingsInput(settings);

  return {
    id: sanitizeUuid(user.id, "User ID"),
    email: user.email ?? null,
    name: sanitizedSettings.profile.name || getFullName(user) || null,
    business_name: sanitizedSettings.profile.businessName || null,
    work: sanitizedSettings.profile.work || null,
    signoff: sanitizedSettings.profile.signoff || null,
    turnaround: sanitizedSettings.profile.turnaround || null,
    client_type: sanitizedSettings.profile.clientType || null,
    client_count: sanitizedSettings.profile.clientCount || null,
    client_source: sanitizedSettings.profile.clientSource || null,
    email_never_say: sanitizedSettings.profile.emailNeverSay || null,
    tone: sanitizedSettings.behaviour.tone || null,
    follow_up_delay: sanitizedSettings.behaviour.followUpDelay || null,
    followup_invoice_delay:
      sanitizedSettings.behaviour.followUpInvoiceDelay || null,
    onboarding_complete:
      typeof sanitizedSettings.onboardingComplete === "boolean"
        ? sanitizedSettings.onboardingComplete
        : false,
  };
}

export function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export function formatPreparedTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapActionRow(row) {
  return {
    id: row.id,
    reasoning: row.reasoning || "",
    title: row.action_label || row.title || row.action || "",
    draft: row.draft || "",
    confidence: mapActionConfidence(row.confidence),
    confidenceReason: mapOptionalText(row.confidence_reason),
    priorityScore: mapActionPriorityScore(row.priority_score),
    steps: mapActionSteps(row.steps),
    status: row.status || "pending",
    createdAt: row.created_at || null,
    time: row.created_at ? formatPreparedTime(row.created_at) : formatPreparedTime(),
    phase: "idle",
  };
}

function mapClientRow(row) {
  return {
    id: row.id,
    name: row.name || "Unnamed client",
    descriptor: row.descriptor || "",
    lastContact: row.last_contact || "",
    status: row.status || "New lead",
    summary: mapOptionalText(row.summary),
    summaryGeneratedAt: mapOptionalTimestamp(row.summary_generated_at),
    notes: ensureArray(row.notes),
    recentActions: ensureArray(row.recent_actions),
  };
}

function mapClientSummaryPayload(payload) {
  return {
    summary: mapOptionalText(payload?.summary),
    summaryGeneratedAt: mapOptionalTimestamp(payload?.summary_generated_at),
  };
}

export async function ensureUserBootstrap(user) {
  const userId = user?.id ? sanitizeUuid(user.id, "User ID") : null;

  if (!userId || bootstrappedUsers.has(userId)) {
    return;
  }

  if (bootstrapPromises.has(userId)) {
    await bootstrapPromises.get(userId);
    return;
  }

  const bootstrapPromise = (async () => {
    const { data: existingUser, error: userLookupError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (userLookupError) {
      throw userLookupError;
    }

    if (!existingUser) {
      const { error: insertUserError } = await supabase
        .from("users")
        .insert({
          id: userId,
          email: user.email ?? null,
          name: getFullName(user) || null,
          business_name: null,
          work: null,
          signoff: null,
          turnaround: null,
          client_type: null,
          client_count: null,
          client_source: null,
          email_never_say: null,
          tone: null,
          follow_up_delay: null,
          followup_invoice_delay: null,
          weekly_digest_enabled: true,
          calendar_connected: null,
          onboarding_complete: false,
        });

      if (insertUserError) {
        throw insertUserError;
      }
    }

    const { count, error: clientsCountError } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (clientsCountError) {
      throw clientsCountError;
    }

    if (!count) {
      const seededRows = SEEDED_CLIENTS.map((client) => ({
        user_id: userId,
        ...client,
      }));

      const { error: seedError } = await supabase
        .from("clients")
        .insert(seededRows);

      if (seedError) {
        throw seedError;
      }
    }

    bootstrappedUsers.add(userId);
  })();

  bootstrapPromises.set(userId, bootstrapPromise);

  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromises.delete(userId);
  }
}

export async function fetchUserProfile(user) {
  const userId = sanitizeUuid(user.id, "User ID");
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeProfileRow(data, user);
}

export async function fetchOnboardingProfile(user) {
  const userId = sanitizeUuid(user.id, "User ID");
  const { data, error } = await supabase
    .from("users")
    .select(
      [
        "id",
        "name",
        "business_name",
        "work",
        "signoff",
        "turnaround",
        "client_type",
        "client_count",
        "client_source",
        "email_never_say",
        "tone",
        "follow_up_delay",
        "followup_invoice_delay",
        "onboarding_complete",
      ].join(","),
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeOnboardingRow(data, user);
}

export async function fetchOnboardingStatus(user) {
  const userId = sanitizeUuid(user.id, "User ID");
  const { data, error } = await supabase
    .from("users")
    .select("onboarding_complete")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.onboarding_complete);
}

export async function saveUserProfile(user, settings) {
  const payload = buildUserPayload(user, sanitizeSettingsInput(settings));

  const { data, error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizeProfileRow(data, user);
}

export async function saveOnboardingProfile(user, settings) {
  const payload = buildOnboardingPayload(user, sanitizeSettingsInput(settings));

  const { data, error } = await supabase
    .from("users")
    .upsert(payload, { onConflict: "id" })
    .select(
      [
        "id",
        "name",
        "business_name",
        "work",
        "signoff",
        "turnaround",
        "client_type",
        "client_count",
        "client_source",
        "email_never_say",
        "tone",
        "follow_up_delay",
        "followup_invoice_delay",
        "onboarding_complete",
      ].join(","),
    )
    .single();

  if (error) {
    throw error;
  }

  return normalizeOnboardingRow(data, user);
}

export async function completeOnboarding(user) {
  const userId = sanitizeUuid(user.id, "User ID");
  const { data, error } = await supabase
    .from("users")
    .update({ onboarding_complete: true })
    .eq("id", userId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizeProfileRow(data, user);
}

export async function completeOnboardingProfile(user) {
  const userId = sanitizeUuid(user.id, "User ID");
  const { data, error } = await supabase
    .from("users")
    .update({ onboarding_complete: true })
    .eq("id", userId)
    .select(
      [
        "id",
        "name",
        "business_name",
        "work",
        "signoff",
        "turnaround",
        "client_type",
        "client_count",
        "client_source",
        "email_never_say",
        "tone",
        "follow_up_delay",
        "followup_invoice_delay",
        "onboarding_complete",
      ].join(","),
    )
    .single();

  if (error) {
    throw error;
  }

  return normalizeOnboardingRow(data, user);
}

export async function fetchPendingActions(userId) {
  const sanitizedUserId = sanitizeUuid(userId, "User ID");
  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .eq("user_id", sanitizedUserId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ensureArray(data).map(mapActionRow);
}

export async function fetchDoneTodayActions(userId) {
  const sanitizedUserId = sanitizeUuid(userId, "User ID");
  const since = new Date(Date.now() - ONE_DAY_IN_MS).toISOString();

  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .eq("user_id", sanitizedUserId)
    .eq("status", "approved")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ensureArray(data).map(mapActionRow);
}

export async function fetchHistoryActions(userId) {
  const sanitizedUserId = sanitizeUuid(userId, "User ID");
  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .eq("user_id", sanitizedUserId)
    .in("status", ["approved", "dismissed"])
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ensureArray(data).map(mapActionRow);
}

export async function updateActionStatus(actionId, status) {
  const sanitizedActionId = sanitizeUuid(actionId, "Action ID");
  const sanitizedStatus = sanitizeActionStatus(status);
  const accessToken = await getSessionAccessToken();
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(
    `${apiBaseUrl}/actions/${sanitizedActionId}/${sanitizedStatus}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.detail || `Request failed with ${response.status}`);
    error.status = response.status;
    error.retryAfterSeconds = payload?.retry_after_seconds ?? null;
    throw error;
  }

  return mapActionRow(payload);
}

export async function generateAction(situation, userContext = {}) {
  const accessToken = await getSessionAccessToken();
  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/actions/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      situation: sanitizePromptInput(situation),
      user_context: sanitizeUserContext(userContext),
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.detail || `Request failed with ${response.status}`);
    error.status = response.status;
    error.retryAfterSeconds = payload?.retry_after_seconds ?? null;
    throw error;
  }

  return mapActionRow(payload);
}

export async function fetchClients(userId) {
  const sanitizedUserId = sanitizeUuid(userId, "User ID");
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", sanitizedUserId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ensureArray(data).map(mapClientRow);
}

export async function generateClientSummary(clientId, options = {}) {
  const sanitizedClientId = sanitizeUuid(clientId, "Client ID");
  const accessToken = await getSessionAccessToken();
  const apiBaseUrl = getApiBaseUrl();
  const force = options.force === true;
  const url = new URL(`${apiBaseUrl}/clients/${sanitizedClientId}/summary`);

  if (force) {
    url.searchParams.set("force", "true");
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.detail || `Request failed with ${response.status}`);
    error.status = response.status;
    error.retryAfterSeconds = payload?.retry_after_seconds ?? null;
    throw error;
  }

  return mapClientSummaryPayload(payload);
}

export async function syncGoogleProviderSession(session) {
  const provider = session?.user?.app_metadata?.provider;
  const refreshToken =
    typeof session?.provider_refresh_token === "string"
      ? session.provider_refresh_token.trim()
      : "";
  const accessToken =
    typeof session?.access_token === "string" ? session.access_token.trim() : "";

  if (provider !== "google" || !refreshToken || !accessToken) {
    return { stored: false };
  }

  const apiBaseUrl = getApiBaseUrl();
  const response = await fetch(`${apiBaseUrl}/integrations/google/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider_refresh_token: refreshToken,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.detail || `Request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  return payload ?? { stored: true };
}

export function buildAgentContext(settings) {
  const items = [
    settings?.profile?.businessName
      ? `Business: ${settings.profile.businessName}`
      : null,
    settings?.profile?.work ? `What you do: ${settings.profile.work}` : null,
    settings?.profile?.clientType
      ? `Typical clients: ${settings.profile.clientType}`
      : null,
    settings?.profile?.clientCount
      ? `Active client load: ${settings.profile.clientCount}`
      : null,
    settings?.profile?.clientSource
      ? `Most clients come from: ${settings.profile.clientSource}`
      : null,
    settings?.profile?.signoff
      ? `Email sign-off: ${settings.profile.signoff}`
      : null,
    settings?.profile?.emailNeverSay
      ? `Never say in emails: ${settings.profile.emailNeverSay}`
      : null,
    settings?.profile?.turnaround
      ? `Quote turnaround: ${settings.profile.turnaround}`
      : null,
    settings?.behaviour?.tone ? `Tone: ${settings.behaviour.tone}` : null,
    settings?.behaviour?.followUpDelay
      ? `Quote follow-up delay: ${settings.behaviour.followUpDelay}`
      : null,
    settings?.behaviour?.followUpInvoiceDelay
      ? `Invoice chase delay: ${settings.behaviour.followUpInvoiceDelay}`
      : null,
  ].filter(Boolean);

  return items;
}
