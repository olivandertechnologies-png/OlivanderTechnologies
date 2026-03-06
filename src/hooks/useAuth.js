import { useEffect, useState } from "react";
import { ensureUserBootstrap } from "../dataLayer.js";
import { navigate } from "../router.js";
import { supabase } from "../supabase.js";

async function ensureUserRow(nextUser) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("id", nextUser.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return;
  }

  const { error: upsertError } = await supabase.from("users").upsert(
    {
      id: nextUser.id,
      email: nextUser.email ?? null,
      name: nextUser.user_metadata?.full_name ?? null,
    },
    { onConflict: "id" },
  );

  if (upsertError) {
    throw upsertError;
  }
}

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
        await ensureUserRow(nextUser);
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
