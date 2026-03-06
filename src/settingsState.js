import { useEffect, useState } from "react";

const INITIAL_SETTINGS = {
  profile: {
    name: "James McKenzie",
    businessName: "McKenzie Plumbing",
    work: "Residential and commercial plumbing, Queenstown",
    signoff: "Cheers, James",
    turnaround: "2 business days",
  },
  behaviour: {
    tone: "Friendly",
    followUpDelay: "After 3 days",
    autoDismissLowPriority: false,
  },
  integrations: {
    calendarConnected: false,
  },
  ui: {
    confirmClear: false,
    isSaved: false,
  },
};

let currentSettings = INITIAL_SETTINGS;
const listeners = new Set();
let saveTimerId = null;

function emit() {
  listeners.forEach((listener) => listener(currentSettings));
}

function updateSettings(next) {
  currentSettings = next;
  emit();
}

function subscribe(listener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function withPartial(section, updates) {
  return {
    ...currentSettings,
    [section]: {
      ...currentSettings[section],
      ...updates,
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

export function useSettingsState() {
  const [snapshot, setSnapshot] = useState(currentSettings);

  useEffect(() => subscribe(setSnapshot), []);

  const setProfileField = (field, value) => {
    updateSettings(
      withPartial("profile", {
        [field]: value,
      }),
    );
  };

  const setBehaviourField = (field, value) => {
    updateSettings(
      withPartial("behaviour", {
        [field]: value,
      }),
    );
  };

  const setCalendarConnected = (value) => {
    updateSettings(
      withPartial("integrations", {
        calendarConnected: value,
      }),
    );
  };

  const setConfirmClear = (value) => {
    updateSettings(
      withPartial("ui", {
        confirmClear: value,
      }),
    );
  };

  const saveChanges = () => {
    updateSettings(
      withPartial("ui", {
        isSaved: true,
      }),
    );

    window.clearTimeout(saveTimerId);
    saveTimerId = window.setTimeout(() => {
      updateSettings(
        withPartial("ui", {
          isSaved: false,
        }),
      );
    }, 2000);
  };

  const clearMemory = () => {
    updateSettings(
      withPartial("ui", {
        confirmClear: false,
      }),
    );
  };

  return {
    ...snapshot,
    initials: getInitials(snapshot.profile.name),
    setProfileField,
    setBehaviourField,
    setCalendarConnected,
    setConfirmClear,
    saveChanges,
    clearMemory,
  };
}
