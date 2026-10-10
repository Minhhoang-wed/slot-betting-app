-- Additive and repeatable. Preserve existing 15-product rounds and all transactions.
BEGIN;
DO $$
DECLARE item RECORD;
BEGIN
  FOR item IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.blind_bag_rounds'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%pool%'
  LOOP
    EXECUTE format('ALTER TABLE public.blind_bag_rounds DROP CONSTRAINT %I', item.conname);
  END LOOP;
END $$;
ALTER TABLE public.blind_bag_rounds ADD CONSTRAINT blind_bag_rounds_pool_size_check
  CHECK (COALESCE((data->>'productsPerSlot')::integer, 1) IN (1, 3)
    AND jsonb_typeof(data->'pool') = 'array'
    AND jsonb_array_length(data->'pool') = 15 * COALESCE((data->>'productsPerSlot')::integer, 1));
COMMIT;
