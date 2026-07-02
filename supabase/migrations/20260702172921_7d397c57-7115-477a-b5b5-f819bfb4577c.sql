
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  baslik TEXT NOT NULL,
  konu TEXT NOT NULL,
  ton TEXT NOT NULL DEFAULT 'gerilim',
  hedef_sure INTEGER NOT NULL DEFAULT 60,
  gorsel_stili TEXT NOT NULL DEFAULT 'karanlik_karikatur',
  format TEXT NOT NULL DEFAULT '9:16',
  dil TEXT NOT NULL DEFAULT 'tr',
  durum TEXT NOT NULL DEFAULT 'taslak',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_projects" ON public.projects FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sira INTEGER NOT NULL,
  anlatim TEXT NOT NULL,
  gorsel_prompt TEXT NOT NULL,
  ses_efekti TEXT,
  ses_url TEXT,
  ses_suresi NUMERIC,
  gorsel_url TEXT,
  durum TEXT NOT NULL DEFAULT 'beklemede',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenes TO authenticated;
GRANT ALL ON public.scenes TO service_role;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_scenes" ON public.scenes FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = scenes.project_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = scenes.project_id AND p.user_id = auth.uid()));

CREATE INDEX idx_scenes_project ON public.scenes(project_id, sira);
CREATE INDEX idx_projects_user ON public.projects(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_scenes_updated BEFORE UPDATE ON public.scenes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
