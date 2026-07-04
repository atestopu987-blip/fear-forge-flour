import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          console.error(error);
          return;
        }
      }
      navigate({ to: "/dashboard", replace: true });
    })();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <div className="mx-auto h-2 w-2 animate-pulse rounded-full bg-primary" />
        <p className="mt-4 font-serif text-2xl">Karanlık Anlatı</p>
        <p className="mt-1 text-sm text-muted-foreground">Stüdyo hazırlanıyor…</p>
      </div>
    </div>
  );
}
