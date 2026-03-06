import { useEffect, useState } from "react";
import { ensureUserBootstrap } from "../dataLayer.js";
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

      try {
        await ensureUserBootstrap(nextUser);
      } catch (error) {
        console.error("Failed to bootstrap Supabase user", error);
      }

      if (!isMounted) {
        return;
      }

      setUser(nextUser);
      setLoading(false);
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
