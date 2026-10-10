-- Migration 003: Allow custom prices for blind bag rounds
-- Run this migration in Supabase SQL Editor to allow adjustable/custom blind bag slot prices.

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop specific known constraint name if it exists
    ALTER TABLE public.blind_bag_rounds DROP CONSTRAINT IF EXISTS blind_bag_rounds_data_check2;
    ALTER TABLE public.blind_bag_rounds DROP CONSTRAINT IF EXISTS blind_bag_rounds_price_check;

    -- Dynamically find and drop any remaining check constraint that enforces 414000
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.blind_bag_rounds'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%414000%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.blind_bag_rounds DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Add updated constraint allowing any non-negative slot price
ALTER TABLE public.blind_bag_rounds
  ADD CONSTRAINT blind_bag_rounds_price_check
  CHECK ((data->>'price')::numeric >= 0);
