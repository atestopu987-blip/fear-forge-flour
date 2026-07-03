import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function onGoogle() {
    setLoading(true);
    try {
      const res = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (res.error) {
        toast.error(res.error.message);
        return;
      }
      if (res.redirected) return;
      navigate({ to: "/dashboard", replace: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-2xl">
        <Link to="/" className="mb-6 block text-sm text-muted-foreground hover:text-foreground">
          ← Ana sayfa
        </Link>
        <h1 className="font-serif text-3xl">Karanlığa dön</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tek tıkla Google hesabınla giriş yap.
        </p>

        <button
          onClick={onGoogle}
          disabled={loading}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M21.35 11.1H12v3.2h5.35c-.23 1.44-1.6 4.22-5.35 4.22-3.22 0-5.85-2.67-5.85-5.95S8.78 6.62 12 6.62c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.98 14.53 3 12 3 6.98 3 3 6.98 3 12s3.98 9 9 9c5.19 0 8.63-3.65 8.63-8.78 0-.59-.07-1.04-.28-1.12z"
            />
          </svg>
          {loading ? "Yönlendiriliyor…" : "Google ile devam et"}
        </button>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Devam ederek karanlıkla anlaşırsın.
        </p>
      </div>
    </div>
  );
}