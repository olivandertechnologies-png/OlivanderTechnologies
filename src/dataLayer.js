import { supabase } from "./supabase.js";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

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

const DEFAULT_PROFILE = {
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
};

const bootstrappedUsers = new Set();
const bootstrapPromises = new Map();

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function getFullName(user) {
  return (
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email ||
    ""
  );
}

function buildUserPayload(user, settings = DEFAULT_PROFILE) {
  return {
    id: user.id,
    email: user.email ?? null,
    name: settings.profile.name || getFullName(user) || null,
    business_name: settings.profile.businessName || null,
    work: settings.profile.work || null,
    signoff: settings.profile.signoff || null,
    turnaround: settings.profile.turnaround || null,
    tone: settings.behaviour.tone || null,
    follow_up_delay: settings.behaviour.followUpDelay || null,
    auto_dismiss_low_priority:
      typeof settings.behaviour.autoDismissLowPriority === "boolean"
        ? settings.behaviour.autoDismissLowPriority
        : null,
    calendar_connected:
      typeof settings.integrations.calendarConnected === "boolean"
        ? settings.integrations.calendarConnected
        : null,
  };
}

function normalizeProfileRow(row, user) {
  const fallbackName = getFullName(user);

  return {
    profile: {
      name: row?.name || fallbackName,
      businessName: row?.business_name || "",
      work: row?.work || "",
      signoff: row?.signoff || "",
      turnaround: row?.turnaround || "",
    },
    behaviour: {
      tone: row?.tone || DEFAULT_PROFILE.behaviour.tone,
      followUpDelay:
        row?.follow_up_delay || DEFAULT_PROFILE.behaviour.followUpDelay,
      autoDismissLowPriority:
        typeof row?.auto_dismiss_low_priority === "boolean"
          ? row.auto_dismiss_low_priority
          : DEFAULT_PROFILE.behaviour.autoDismissLowPriority,
    },
    integrations: {
      calendarConnected: Boolean(row?.calendar_connected),
    },
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
    title: row.title || "",
    draft: row.draft || "",
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
    notes: ensureArray(row.notes),
    recentActions: ensureArray(row.recent_actions),
  };
}

export async function ensureUserBootstrap(user) {
  if (!user?.id || bootstrappedUsers.has(user.id)) {
    return;
  }

  if (bootstrapPromises.has(user.id)) {
    await bootstrapPromises.get(user.id);
    return;
  }

  const bootstrapPromise = (async () => {
    const { data: existingUser, error: userLookupError } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (userLookupError) {
      throw userLookupError;
    }

    if (!existingUser) {
      const { error: insertUserError } = await supabase
        .from("users")
        .insert({
          id: user.id,
          email: user.email ?? null,
          name: getFullName(user) || null,
          business_name: null,
          work: null,
          signoff: null,
          turnaround: null,
          tone: null,
          follow_up_delay: null,
          auto_dismiss_low_priority: null,
          calendar_connected: null,
        });

      if (insertUserError) {
        throw insertUserError;
      }
    }

    const { count, error: clientsCountError } = await supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (clientsCountError) {
      throw clientsCountError;
    }

    if (!count) {
      const seededRows = SEEDED_CLIENTS.map((client) => ({
        user_id: user.id,
        ...client,
      }));

      const { error: seedError } = await supabase
        .from("clients")
        .insert(seededRows);

      if (seedError) {
        throw seedError;
      }
    }

    bootstrappedUsers.add(user.id);
  })();

  bootstrapPromises.set(user.id, bootstrapPromise);

  try {
    await bootstrapPromise;
  } finally {
    bootstrapPromises.delete(user.id);
  }
}

export async function fetchUserProfile(user) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeProfileRow(data, user);
}

export async function saveUserProfile(user, settings) {
  const payload = buildUserPayload(user, settings);

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

export async function fetchPendingActions(userId) {
  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ensureArray(data).map(mapActionRow);
}

export async function fetchDoneTodayActions(userId) {
  const since = new Date(Date.now() - ONE_DAY_IN_MS).toISOString();

  const { data, error } = await supabase
    .from("actions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "approved")
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ensureArray(data).map(mapActionRow);
}

export async function updateActionStatus(actionId, status) {
  const { data, error } = await supabase
    .from("actions")
    .update({ status })
    .eq("id", actionId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapActionRow(data);
}

export async function insertGeneratedAction(userId, generated) {
  const { data, error } = await supabase
    .from("actions")
    .insert({
      user_id: userId,
      status: "pending",
      reasoning: generated.reasoning,
      title: generated.title,
      draft: generated.draft,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return mapActionRow(data);
}

export async function fetchClients(userId) {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ensureArray(data).map(mapClientRow);
}

export function buildAgentContext(settings) {
  const items = [
    settings?.profile?.businessName
      ? `Business: ${settings.profile.businessName}`
      : null,
    settings?.profile?.work ? `What you do: ${settings.profile.work}` : null,
    settings?.profile?.signoff
      ? `Email sign-off: ${settings.profile.signoff}`
      : null,
    settings?.profile?.turnaround
      ? `Quote turnaround: ${settings.profile.turnaround}`
      : null,
    settings?.behaviour?.tone ? `Tone: ${settings.behaviour.tone}` : null,
    settings?.behaviour?.followUpDelay
      ? `Follow-up delay: ${settings.behaviour.followUpDelay}`
      : null,
  ].filter(Boolean);

  return items;
}
