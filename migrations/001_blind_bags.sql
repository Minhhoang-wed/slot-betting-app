-- Additive migration: run once in Supabase SQL Editor. Does not touch betting tables.
CREATE TABLE IF NOT EXISTS public.blind_bag_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  data JSONB NOT NULL,
  CHECK (jsonb_array_length(data->'pool') = 15),
  CHECK (jsonb_array_length(data->'slots') <= 15),
  CHECK ((data->>'price')::integer = 414000)
);
-- Match the existing app's database access model.
ALTER TABLE public.blind_bag_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "App access blind bags" ON public.blind_bag_rounds;
CREATE POLICY "App access blind bags" ON public.blind_bag_rounds
  FOR ALL USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON public.blind_bag_rounds TO anon, authenticated;
