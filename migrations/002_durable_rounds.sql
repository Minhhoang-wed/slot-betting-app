-- Additive migration. Do not run schema.sql (it resets existing data).
BEGIN;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS next_round_id uuid REFERENCES public.games(id) ON DELETE SET NULL;
ALTER TABLE public.slots ADD COLUMN IF NOT EXISTS shares jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.finish_slot_round(
  p_game_id uuid, p_menu_id uuid, p_expected_updated_at timestamptz,
  p_winners jsonb, p_mode text, p_results jsonb, p_open_next boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE g public.games; m public.menus; n public.games; next_number integer;
BEGIN
  -- Serialize round allocation for one menu, including concurrent retries.
  SELECT * INTO m FROM public.menus WHERE id = p_menu_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Menu không tồn tại'; END IF;
  SELECT * INTO g FROM public.games WHERE id = p_game_id AND menu_id = p_menu_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chuyến không tồn tại'; END IF;
  IF p_open_next AND g.next_round_id IS NOT NULL THEN
    RETURN jsonb_build_object('completedId', g.id, 'nextId', g.next_round_id);
  END IF;
  IF g.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Dữ liệu chuyến đã thay đổi. Hãy tải lại trước khi chốt';
  END IF;
  IF p_mode NOT IN ('solo','split2','split3') OR jsonb_typeof(p_winners) <> 'array' OR jsonb_typeof(p_results) <> 'array' THEN
    RAISE EXCEPTION 'Kết quả không hợp lệ';
  END IF;
  UPDATE public.games SET status='finished', winners=p_winners, settle_mode=p_mode,
    finished_results=p_results, finished_at=coalesce(finished_at,now()), updated_at=now()
    WHERE id=g.id;
  IF p_open_next THEN
    SELECT coalesce(max(round_number),0)+1 INTO next_number FROM public.games WHERE menu_id=m.id;
    INSERT INTO public.games(menu_id,round_number,name,total_slots,slot_price,prize_value)
      VALUES(m.id,next_number,m.name || ' • Chuyến #' || next_number,m.total_slots,m.slot_price,m.prize_value) RETURNING * INTO n;
    INSERT INTO public.slots(game_id,slot_number) SELECT n.id, generate_series(1,n.total_slots);
    UPDATE public.games SET next_round_id=n.id WHERE id=g.id;
  END IF;
  RETURN jsonb_build_object('completedId',g.id,'nextId',n.id);
END $$;

-- A slot change invalidates the snapshot used to calculate settlement.
CREATE OR REPLACE FUNCTION public.touch_slot_round() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_status text;
BEGIN
  SELECT status INTO current_status FROM public.games WHERE id=coalesce(NEW.game_id,OLD.game_id) FOR UPDATE;
  IF current_status='finished' THEN RAISE EXCEPTION 'Chuyến đã chốt. Mở lại chuyến trước khi sửa ghế'; END IF;
  UPDATE public.games SET updated_at=clock_timestamp() WHERE id=coalesce(NEW.game_id,OLD.game_id);
  RETURN coalesce(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS touch_slot_round ON public.slots;
CREATE TRIGGER touch_slot_round BEFORE INSERT OR UPDATE OR DELETE ON public.slots
  FOR EACH ROW EXECUTE FUNCTION public.touch_slot_round();

CREATE OR REPLACE FUNCTION public.create_slot_round(p_menu_id uuid, p_options jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE m public.menus; g public.games; number integer; slot_count integer; price numeric; prize numeric;
BEGIN
  SELECT * INTO m FROM public.menus WHERE id=p_menu_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Menu không tồn tại'; END IF;
  SELECT coalesce(max(round_number),0)+1 INTO number FROM public.games WHERE menu_id=m.id;
  slot_count=coalesce((p_options->>'totalSlots')::integer,m.total_slots);
  price=coalesce((p_options->>'slotPrice')::numeric,m.slot_price);
  prize=coalesce((p_options->>'prizeValue')::numeric,m.prize_value);
  IF slot_count < 1 OR slot_count > 100 OR price < 0 OR price <> trunc(price) OR prize < 0 OR prize <> trunc(prize) THEN
    RAISE EXCEPTION 'Số ghế hoặc giá không hợp lệ';
  END IF;
  INSERT INTO public.games(menu_id,round_number,name,total_slots,slot_price,prize_value)
    VALUES(m.id,number,coalesce(nullif(trim(p_options->>'name'),''),m.name || ' • Chuyến #' || number),slot_count,price,prize) RETURNING * INTO g;
  INSERT INTO public.slots(game_id,slot_number) SELECT g.id,generate_series(1,slot_count);
  RETURN g.id;
END $$;

CREATE OR REPLACE FUNCTION public.mutate_slot_round(p_game_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE g public.games; menu uuid; number integer; slot_count integer; buyer text; selected integer[]; price numeric; prize numeric; owners jsonb;
BEGIN
  SELECT menu_id INTO menu FROM public.games WHERE id=p_game_id;
  PERFORM 1 FROM public.menus WHERE id=menu FOR UPDATE;
  SELECT * INTO g FROM public.games WHERE id=p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Chuyến không tồn tại'; END IF;
  IF p_action='config' AND g.status='finished' AND coalesce(p_payload->>'status','finished')='finished' THEN
    IF (p_payload ? 'totalSlots' AND (p_payload->>'totalSlots')::integer<>g.total_slots)
      OR (p_payload ? 'slotPrice' AND (p_payload->>'slotPrice')::numeric<>g.slot_price)
      OR (p_payload ? 'prizeValue' AND (p_payload->>'prizeValue')::numeric<>g.prize_value) THEN
      RAISE EXCEPTION 'Mở lại chuyến trước khi đổi giá hoặc số ghế';
    END IF;
    UPDATE public.games SET name=coalesce(nullif(trim(p_payload->>'name'),''),name),updated_at=now() WHERE id=g.id;
    RETURN jsonb_build_object('gameId',g.id,'slots','[]'::jsonb);
  END IF;
  IF g.status='finished' AND NOT (p_action='config' AND p_payload->>'status'='open') AND p_action<>'reset' THEN
    RAISE EXCEPTION 'Chuyến đã chốt. Mở lại chuyến trước khi sửa';
  END IF;
  buyer=nullif(regexp_replace(trim(p_payload->>'playerName'),'\s+',' ','g'),'');
  IF p_action='assign' THEN
    owners=CASE WHEN buyer IS NULL THEN '[]'::jsonb ELSE coalesce(p_payload->'shares','[]'::jsonb) END;
    IF jsonb_typeof(owners)<>'array' THEN RAISE EXCEPTION 'Tỷ lệ ghế chung không hợp lệ'; END IF;
    IF jsonb_array_length(owners)>0 THEN
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(owners) o WHERE nullif(trim(o->>'name'),'') IS NULL OR (o->>'percent')::numeric < 1 OR (o->>'percent')::numeric > 100 OR (o->>'percent')::numeric <> trunc((o->>'percent')::numeric))
        OR (SELECT coalesce(sum((o->>'percent')::numeric),0) FROM jsonb_array_elements(owners) o)<>100
        OR (SELECT count(DISTINCT lower(trim(o->>'name'))) FROM jsonb_array_elements(owners) o)<>jsonb_array_length(owners) THEN
        RAISE EXCEPTION 'Tỷ lệ phải đủ 100%% và tên khác nhau';
      END IF;
    END IF;
    number=(p_payload->>'slotNumber')::integer;
    IF number IS NULL OR number < 1 OR number > g.total_slots THEN RAISE EXCEPTION 'Ghế không hợp lệ'; END IF;
    UPDATE public.slots SET player_name=buyer,shares=owners,updated_at=now() WHERE game_id=g.id AND slot_number=number;
    IF NOT FOUND THEN INSERT INTO public.slots(game_id,slot_number,player_name,shares) VALUES(g.id,number,buyer,owners); END IF;
    selected=ARRAY[number];
  ELSIF p_action='quick' THEN
    slot_count=(p_payload->>'slotCount')::integer;
    IF buyer IS NULL OR slot_count IS NULL OR slot_count<1 THEN RAISE EXCEPTION 'Tên hoặc số ghế không hợp lệ'; END IF;
    SELECT array_agg(slot_number ORDER BY slot_number) INTO selected FROM (
      SELECT slot_number FROM public.slots WHERE game_id=g.id AND player_name IS NULL ORDER BY slot_number LIMIT slot_count
    ) available;
    IF coalesce(array_length(selected,1),0)<>slot_count THEN RAISE EXCEPTION 'Không đủ ghế trống'; END IF;
    UPDATE public.slots SET player_name=buyer,shares='[]',updated_at=now() WHERE game_id=g.id AND slot_number=ANY(selected);
  ELSIF p_action='release' THEN
    IF buyer IS NULL THEN RAISE EXCEPTION 'Thiếu tên khách'; END IF;
    IF EXISTS(SELECT 1 FROM public.slots s, jsonb_array_elements(s.shares) p WHERE s.game_id=g.id AND lower(trim(p->>'name'))=lower(buyer)) THEN
      RAISE EXCEPTION 'Khách có ghế chung. Hãy sửa tỷ lệ tại từng ghế';
    END IF;
    UPDATE public.slots SET player_name=NULL,shares='[]',updated_at=now() WHERE game_id=g.id
      AND lower(regexp_replace(trim(player_name),'\s+',' ','g'))=lower(buyer);
  ELSIF p_action IN ('config','add','remove','reset') THEN
    slot_count=CASE p_action WHEN 'add' THEN g.total_slots+1 WHEN 'remove' THEN g.total_slots-1 ELSE coalesce((p_payload->>'totalSlots')::integer,g.total_slots) END;
    price=coalesce((p_payload->>'slotPrice')::numeric,g.slot_price);
    prize=coalesce((p_payload->>'prizeValue')::numeric,g.prize_value);
    IF slot_count<1 OR slot_count>100 OR price<0 OR price<>trunc(price) OR prize<0 OR prize<>trunc(prize) THEN RAISE EXCEPTION 'Số ghế hoặc giá không hợp lệ'; END IF;
    IF p_payload ? 'status' AND p_payload->>'status' NOT IN ('open','finished','full') THEN RAISE EXCEPTION 'Trạng thái không hợp lệ'; END IF;
    IF g.status<>'finished' AND p_payload->>'status'='finished' THEN RAISE EXCEPTION 'Dùng chức năng chốt kết quả'; END IF;
    UPDATE public.games SET status=CASE WHEN p_action='reset' THEN 'open' ELSE coalesce(p_payload->>'status',status) END,
      name=coalesce(nullif(trim(p_payload->>'name'),''),name),total_slots=slot_count,slot_price=price,prize_value=prize,updated_at=now()
      WHERE id=g.id;
    -- Resize while the game is open. Finishing must go through finish_slot_round.
    DELETE FROM public.slots WHERE game_id=g.id AND slot_number>slot_count;
    INSERT INTO public.slots(game_id,slot_number) SELECT g.id,i FROM generate_series(1,slot_count) i ON CONFLICT(game_id,slot_number) DO NOTHING;
    IF p_action='reset' THEN
      UPDATE public.slots SET player_name=NULL,shares='[]',updated_at=now() WHERE game_id=g.id;
    END IF;
    IF p_action='reset' OR (g.status='finished' AND p_payload->>'status'='open') THEN
      UPDATE public.games SET winners='[]',finished_results='[]',finished_at=NULL,next_round_id=NULL WHERE id=g.id;
    END IF;
  ELSE RAISE EXCEPTION 'Thao tác không hợp lệ';
  END IF;
  RETURN jsonb_build_object('gameId',g.id,'slots',coalesce(to_jsonb(selected),'[]'::jsonb));
END $$;
COMMIT;
