-- =================================================================
-- SUPABASE STANDARD PRODUCTION DATABASE SCHEMA (CHUẨN 100%)
-- HỆ THỐNG LUCKY SLOT PRO - LIVESTREAM GAME SHOW & QUẢN LÝ BILL VIETQR
-- Hỗ trợ: Đa Menu (150K, 200K, 100K...) • CRUD Chuyến (Rounds) • Mỹ Phẩm • Đối Soát Khách Hàng
-- =================================================================
-- HƯỚNG DẪN CHẠY:
-- 1. Vào Supabase Dashboard (https://supabase.com) -> Chọn Project của bạn
-- 2. Chọn mục "SQL Editor" ở menu bên trái
-- 3. Tạo một "New query", dán toàn bộ đoạn mã bên dưới và bấm "Run" (hoặc Ctrl+Enter)
-- =================================================================

-- Kích hoạt tiện ích mở rộng tạo UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =================================================================
-- PHẦN 1: DỌN DẸP BẢNG CŨ (CLEAN RESET 100%)
-- Xóa sạch các bảng phiên bản cũ để tái tạo cấu trúc chuẩn
-- Giải quyết triệt để lỗi: "column menu_id does not exist" do bảng games cũ còn lưu lại
-- =================================================================
DROP TABLE IF EXISTS public.bills CASCADE;
DROP TABLE IF EXISTS public.slots CASCADE;
DROP TABLE IF EXISTS public.games CASCADE;
DROP TABLE IF EXISTS public.menus CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;

-- =================================================================
-- 1. BẢNG MENUS (Danh mục các Menu Kèo: 150K, 200K, 100K, 300K VIP...)
-- =================================================================
CREATE TABLE public.menus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    slot_price NUMERIC NOT NULL DEFAULT 150000,
    total_slots INT NOT NULL DEFAULT 12,
    prize_value NUMERIC NOT NULL DEFAULT 1500000,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- 2. BẢNG GAMES (Quản lý các Chuyến / Ván Kèo theo từng Menu)
-- Mỗi Menu có thể có nhiều Chuyến (Chuyến #1, Chuyến #2, Chuyến #3...)
-- Hỗ trợ CRUD: Thêm, Xóa, Sửa chuyến tùy ý
-- =================================================================
CREATE TABLE public.games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id UUID REFERENCES public.menus(id) ON DELETE CASCADE,
    round_number INT NOT NULL DEFAULT 1,
    name TEXT NOT NULL,
    total_slots INT NOT NULL DEFAULT 12,
    slot_price NUMERIC NOT NULL DEFAULT 150000,
    prize_value NUMERIC NOT NULL DEFAULT 1500000,
    status TEXT NOT NULL DEFAULT 'open', -- 'open' (Đang mở) | 'full' (Đủ người) | 'finished' (Đã xong)
    settle_mode TEXT NOT NULL DEFAULT 'solo', -- 'solo' (Trúng trọn) | 'split2' (Chia đôi) | 'split3' (Chia ba)
    winners JSONB DEFAULT '[]'::jsonb, -- Danh sách tên người trúng giải
    finished_results JSONB DEFAULT '[]'::jsonb, -- Bảng kết quả quyết toán tài chính chi tiết
    created_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ DEFAULT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_games_menu_round UNIQUE (menu_id, round_number)
);

-- =================================================================
-- 3. BẢNG SLOTS (Quản lý chi tiết từng ô Slot 1..N của mỗi Chuyến)
-- =================================================================
CREATE TABLE public.slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    slot_number INT NOT NULL,
    player_name TEXT DEFAULT NULL, -- NULL nghĩa là ô cược đang trống
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_slots_game_slot UNIQUE (game_id, slot_number)
);

-- =================================================================
-- 4. BẢNG PRODUCTS (Danh mục mỹ phẩm / sản phẩm bán kèm trong buổi live)
-- =================================================================
CREATE TABLE public.products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    image_url TEXT,
    in_stock BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- 5. BẢNG BILLS (Hóa đơn thanh toán đối soát & mã VietQR)
-- =================================================================
CREATE TABLE public.bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bill_code TEXT NOT NULL UNIQUE,
    game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    game_name TEXT NOT NULL,
    slot_count INT DEFAULT 0,
    slots_list JSONB DEFAULT '[]'::jsonb,
    buy_cost NUMERIC NOT NULL DEFAULT 0,
    prize_won NUMERIC NOT NULL DEFAULT 0,
    attached_products JSONB DEFAULT '[]'::jsonb, -- Danh sách mỹ phẩm khách mua đính kèm
    attached_total_cost NUMERIC NOT NULL DEFAULT 0, -- Tiền mỹ phẩm mua kèm
    net_amount NUMERIC NOT NULL DEFAULT 0, -- Âm: Khách cần trả Shop; Dương: Shop chuyển trả Khách
    qr_url TEXT DEFAULT NULL,
    status TEXT DEFAULT 'pending', -- 'pending' | 'paid' | 'completed'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =================================================================
-- 6. CHỈ MỤC TĂNG TỐC TRUY VẤN (INDEXES)
-- =================================================================
CREATE INDEX IF NOT EXISTS idx_menus_code ON public.menus(code);
CREATE INDEX IF NOT EXISTS idx_games_menu_id ON public.games(menu_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON public.games(status);
CREATE INDEX IF NOT EXISTS idx_slots_game_id ON public.slots(game_id);
CREATE INDEX IF NOT EXISTS idx_slots_player ON public.slots(player_name);
CREATE INDEX IF NOT EXISTS idx_bills_customer ON public.bills(customer_name);
CREATE INDEX IF NOT EXISTS idx_bills_code ON public.bills(bill_code);

-- =================================================================
-- 7. CẤU HÌNH BẢO MẬT ROW LEVEL SECURITY (RLS)
-- Cho phép ứng dụng Node.js & trình duyệt đọc/ghi dữ liệu thông suốt
-- =================================================================
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cho phép truy cập menus" ON public.menus;
CREATE POLICY "Cho phép truy cập menus" ON public.menus FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Cho phép truy cập games" ON public.games;
CREATE POLICY "Cho phép truy cập games" ON public.games FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Cho phép truy cập slots" ON public.slots;
CREATE POLICY "Cho phép truy cập slots" ON public.slots FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Cho phép truy cập products" ON public.products;
CREATE POLICY "Cho phép truy cập products" ON public.products FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Cho phép truy cập bills" ON public.bills;
CREATE POLICY "Cho phép truy cập bills" ON public.bills FOR ALL USING (true) WITH CHECK (true);

-- =================================================================
-- 8. KÍCH HOẠT SUPABASE REALTIME ĐỒNG BỘ TỨC THÌ
-- =================================================================
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menus;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.games;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.slots;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bills;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- =================================================================
-- 9. KHỞI TẠO DỮ LIỆU CHUẨN BAN ĐẦU (CLEAN SEED - KHÔNG DỮ LIỆU MẪU RÁC)
-- Chỉ tạo các danh mục Menu Kèo và Danh mục Mỹ Phẩm chuẩn.
-- KHÔNG CÓ người chơi giả lập, KHÔNG CÓ lịch sử chuyến ảo!
-- =================================================================
INSERT INTO public.menus (code, name, slot_price, total_slots, prize_value, description)
VALUES 
    ('MENU_150K', 'Menu Kèo 150K', 150000, 12, 1500000, 'Kèo phổ thông 150.000 đ/slot - 12 ô'),
    ('MENU_200K', 'Menu Kèo 200K', 200000, 12, 2000000, 'Kèo cao cấp 200.000 đ/slot - 12 ô'),
    ('MENU_100K', 'Menu Kèo 100K', 100000, 10, 900000, 'Kèo Mini 100.000 đ/slot - 10 ô'),
    ('MENU_300K', 'Menu Kèo 300K VIP', 300000, 12, 3200000, 'Kèo VIP Luxury 300.000 đ/slot - 12 ô')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.products (name, price, image_url)
VALUES 
    ('Son YSL Rouge Pur Couture #01', 850000, 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=300'),
    ('Serum Phục Hồi La Roche-Posay B5', 420000, 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=300'),
    ('Nước Hoa Chanel Coco Mademoiselle 50ml', 2950000, 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=300'),
    ('Kem Chống Nắng Anessa Perfect UV 60ml', 460000, 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=300'),
    ('Phấn Phủ Bột Kiềm Dầu Laura Mercier', 920000, 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=300'),
    ('Nước Tẩy Trang Bioderma Hồng 500ml', 380000, 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=300')
ON CONFLICT DO NOTHING;
