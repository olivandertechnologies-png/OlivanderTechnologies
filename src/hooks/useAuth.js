import { useEffect, useState } from "react";
import {
  ensureUserBootstrap,
  fetchOnboardingStatus,
  syncGoogleProviderSession,
} from "../dataLayer.js";
import { navigate } from "../router.js";
import { supabase } from "../supabase.js";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const syncSession = async (session) => {
      const nextUser = session?.user ?? null;

      if (!nextUser) {
        if (!isMounted) {
          return;
        }

        setUser(null);
        setLoading(false);
        navigate("/", { replace: true });
        return;
      }

      let onboardingComplete = false;
      let hasOnboardingStatus = false;

      try {
        await ensureUserBootstrap(nextUser);
      } catch (error) {
        console.error("Failed to bootstrap Supabase user", error);
      }

      try {
        await syncGoogleProviderSession(session);
      } catch (error) {
        console.error("Failed to sync Google provider session", error);
      }

      try {
        onboardingComplete = await fetchOnboardingStatus(nextUser);
        hasOnboardingStatus = true;
      } catch (error) {
        console.error("Failed to fetch onboarding status", error);
      }

      if (!isMounted) {
        return;
      }

      setUser(nextUser);
      setLoading(false);

      const currentPath = window.location.pathname;
      if (hasOnboardingStatus && !onboardingComplete && currentPath !== "/onboarding") {
        navigate("/onboarding", { replace: true });
        return;
      }

      if (hasOnboardingStatus && onboardingComplete && currentPath === "/onboarding") {
        navigate("/dashboard", { replace: true });
      }
    };

    const loadSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        await syncSession(data.session);
      } catch (error) {
        console.error("Failed to load Supabase session", error);

        if (!isMounted) {
          return;
        }

        setUser(null);
        setLoading(false);
        navigate("/", { replace: true });
      }
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncSession(session);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
