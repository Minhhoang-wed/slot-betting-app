const { key, allocate, groups, calculateBySlots, winningSlotsFromResults } = require('../views/js/settlement-core');
/**
 * MODEL LAYER: Thống Kê Dữ Liệu & Xuất Báo Cáo File Excel (CSV Chuẩn UTF-8 BOM)
 * Phục vụ nghiệp vụ:
 * 1. Thống kê chi tiết & xuất file cho từng Menu (150K, 200K...) chuẩn format hóa đơn kế toán
 * 2. Xuất file tổng hợp toàn bộ các Menu livestream
 * 3. Xuất file chi tiết từng khách hàng (gồm kèo cược & mỹ phẩm mua kèm)
 * 4. Tính toán Net chính xác 100%: cấn trừ vốn, thưởng trúng và toàn bộ mỹ phẩm đính kèm
 */
const MenuModel = require('./MenuModel');
const GameModel = require('./GameModel');

const ReportModel = {
  /**
   * Thống kê chi tiết từng khách hàng theo một Menu cụ thể (vd: Menu 150K)
   * Đồng bộ chính xác cả từ finishedResults, slots, winners, deductSlotCost và mỹ phẩm
   * @param {string} menuId 
   */
  async getCustomerStatsByMenu(menuId, snapshot = null) {
    const menu = snapshot?.menu || await MenuModel.getMenuById(menuId);
    if (!menu) throw new Error('Menu không tồn tại!');

    // Đảm bảo ván hiện tại của menu này đã được tải/khởi tạo


    let allRounds = snapshot ? snapshot.rounds : await GameModel.getAllRounds(menu.id);
    if (!snapshot && (!allRounds || allRounds.length === 0)) {
      allRounds = await GameModel.getAllRounds(menuId);
    }
    const customerMap = {};

    allRounds.forEach(round => {
      // Ưu tiên 1: Nếu round đã được chốt với finishedResults
      if (round.finishedResults && Array.isArray(round.finishedResults) && round.finishedResults.length > 0) {
        round.finishedResults.forEach(res => {
          const name = res.playerName ? res.playerName.trim() : 'Khách';
          if (!customerMap[key(name)]) {
            customerMap[key(name)] = {
              customerName: name,
              menuId: menu.id,
              menuName: menu.name,
              slotPrice: round.slotPrice ?? menu.slot_price,
              totalSlots: 0,
              totalBuyCost: 0,
              totalPrizeWon: 0,
              totalAttachedCost: 0,
              attachedItems: [],
              netAmount: 0,
              roundsCount: 0,
              roundsDetails: []
            };
          }

          const slotCount = res.slotCount || (res.slotsList ? res.slotsList.length : 0);
          const buyCost = res.buyCost ?? (slotCount * (round.slotPrice ?? menu.slot_price));
          const prizeWon = res.prizeWon || 0;
          const attachedCost = res.attachedTotalCost !== undefined ? res.attachedTotalCost : (
            (res.attachedItems || []).reduce((sum, item) => sum + (Number(item.price) * Number(item.qty || 1)), 0)
          );
          const net = res.netAmount !== undefined ? res.netAmount : (
            (res.isWinner ? (res.deducted ? (prizeWon - buyCost) : prizeWon) : -buyCost) - attachedCost
          );

          customerMap[key(name)].totalSlots += slotCount;
          customerMap[key(name)].totalBuyCost += buyCost;
          customerMap[key(name)].totalPrizeWon += prizeWon;
          customerMap[key(name)].totalAttachedCost += attachedCost;
          if (res.attachedItems && res.attachedItems.length > 0) {
            customerMap[key(name)].attachedItems.push(...res.attachedItems);
          }
          customerMap[key(name)].netAmount += net;
          customerMap[key(name)].roundsCount += 1;
          customerMap[key(name)].roundsDetails.push({
            roundNumber: round.roundNumber,
            roundName: round.name,
            createdAt: round.createdAt,
            finishedAt: round.finishedAt,
            slotPrice:round.slotPrice,
            slots: res.slotsList || [],
            slotCount,
            buyCost,
            isWinner: !!res.isWinner,
            prizeWon,
            winningSlotsList: res.winningSlotsList,
            winningSlotCount: res.winningSlotCount,
            prizeRule: res.prizeRule,
            attachedItems: res.attachedItems || [],
            attachedCost,
            net,
            status: round.status
          });
        });
        return;
      }

      // Ưu tiên 2: Round chưa chốt hoặc lưu dạng slots thô
      const roundPlayers = groups(round);

      const roundWinners = (round.winners || []).map(key);
      const bySlots = Array.isArray(round.winningSlots) && round.winningSlots.length > 0;
      const slotResults = bySlots ? calculateBySlots(round, round.winningSlots, round.deductSlotCost ?? true, round.attachedProducts || {}) : null;
      const awards = bySlots ? Object.fromEntries(slotResults.map(r=>[key(r.playerName),r.prizeWon])) : roundWinners.length ? allocate(Number(round.prizeValue), roundWinners,
        roundWinners.map(id => Math.round((roundPlayers.get(id)?.slotCount || 0) * 100))) : {};

      [...roundPlayers].forEach(([id, participant]) => {
        const name=participant.name,slotNums=participant.slots;
        if (!customerMap[key(name)]) {
          customerMap[key(name)] = {
            customerName: name,
            menuId: menu.id,
            menuName: menu.name,
            slotPrice: round.slotPrice ?? menu.slot_price,
            totalSlots: 0,
            totalBuyCost: 0,
            totalPrizeWon: 0,
            totalAttachedCost: 0,
            attachedItems: [],
            netAmount: 0,
            roundsCount: 0,
            roundsDetails: []
          };
        }

        const buyCost = participant.totalCost;
        const slotResult = slotResults?.find(r=>key(r.playerName)===id);
        const isWinner = bySlots ? slotResult.isWinner : roundWinners.includes(id);
        let prizeWon = 0;
        if (isWinner) {
          prizeWon = awards[id] || 0;
        }

        // Lấy mỹ phẩm đính kèm nếu có trong round
        const attached = (round.attachedProducts && round.attachedProducts[name]) || [];
        const attachedCost = attached.reduce((sum, item) => sum + (Number(item.price) * Number(item.qty || 1)), 0);
        const deduct = round.deductSlotCost !== undefined ? round.deductSlotCost : true;

        let net = 0;
        if (isWinner) {
          net = deduct ? (prizeWon - buyCost) : prizeWon;
        } else {
          net = -buyCost;
        }
        net -= attachedCost;

        customerMap[key(name)].totalSlots += participant.slotCount;
        customerMap[key(name)].totalBuyCost += buyCost;
        customerMap[key(name)].totalPrizeWon += prizeWon;
        customerMap[key(name)].totalAttachedCost += attachedCost;
        if (attached.length > 0) {
          customerMap[key(name)].attachedItems.push(...attached);
        }
        customerMap[key(name)].netAmount += net;
        customerMap[key(name)].roundsCount += 1;
        customerMap[key(name)].roundsDetails.push({
          roundNumber: round.roundNumber,
          roundName: round.name,
          createdAt: round.createdAt,
          finishedAt: round.finishedAt,
          slotPrice: round.slotPrice,
          slots: slotNums,
          slotCount: participant.slotCount,
          buyCost,
          isWinner,
          prizeWon,
          winningSlotsList: slotResult?.winningSlotsList,
          winningSlotCount: slotResult?.winningSlotCount,
          prizeRule: slotResult?.prizeRule,
          attachedItems: attached,
          attachedCost,
          net,
          status: round.status
        });
      });
    });

    const customers = Object.values(customerMap).sort((a, b) => b.totalSlots - a.totalSlots);

    // Tính tổng chỉ số của Menu này
    const summary = {
      menuId: menu.id,
      menuName: menu.name,
      slotPrice: menu.slot_price,
      prizeValue: menu.prize_value,
      totalRounds: allRounds.length,
      completedRounds: allRounds.filter(r => r.status === 'finished').length,
      totalCustomers: customers.length,
      grandTotalSlots: customers.reduce((sum, c) => sum + c.totalSlots, 0),
      grandTotalBuyCost: customers.reduce((sum, c) => sum + c.totalBuyCost, 0),
      grandTotalPrizeWon: customers.reduce((sum, c) => sum + c.totalPrizeWon, 0),
      grandTotalAttachedCost: customers.reduce((sum, c) => sum + (c.totalAttachedCost || 0), 0),
      grandNetAmount: customers.reduce((sum, c) => sum + c.netAmount, 0)
    };

    return {
      menu,
      summary,
      customers,
      rounds: allRounds.map(r => ({
        id: r.id,
        roundNumber: r.roundNumber,
        name: r.name,
        status: r.status,
        totalSlots: r.totalSlots,
        occupiedSlots: (r.slots || []).filter(s => s.player_name).length,
        winners: r.winners || [],
        winningSlots: winningSlotsFromResults(r.finishedResults) ?? r.winningSlots ?? null,
        prizeRule: (r.finishedResults || []).find(result=>result.prizeRule)?.prizeRule || null,
        prizeValue: r.prizeValue,
        createdAt: r.createdAt
      }))
    };
  },

  /**
   * Thống kê tổng hợp toàn bộ khách hàng qua TẤT CẢ các Menu
   */
  async getAllCustomersSummary() {
    const menus = await MenuModel.getAllMenus();
    const allRounds = await GameModel.getAllRounds();
    const globalCustomerMap = {};

    for (const menu of menus) {
      const { customers } = await this.getCustomerStatsByMenu(menu.id, { menu, rounds:allRounds.filter(r=>r.menuId===menu.id) });
      customers.forEach(c => {
        if (!globalCustomerMap[key(c.customerName)]) {
          globalCustomerMap[key(c.customerName)] = {
            customerName: c.customerName,
            menuBreakdown: {}, // { [menuId]: { menuName, slotCount, buyCost, prizeWon, attachedCost, net } }
            totalSlots: 0,
            totalBuyCost: 0,
            totalPrizeWon: 0,
            totalAttachedCost: 0,
            attachedItems: [],
            netAmount: 0
          };
        }

        const entry = globalCustomerMap[key(c.customerName)];
        entry.menuBreakdown[menu.id] = {
          menuId: menu.id,
          menuName: menu.name,
          slotPrice: menu.slot_price,
          slotCount: c.totalSlots,
          buyCost: c.totalBuyCost,
          prizeWon: c.totalPrizeWon,
          attachedCost: c.totalAttachedCost || 0,
          net: c.netAmount,
          roundsCount: c.roundsCount,
          attachedItems: c.attachedItems || [],
          rounds: c.roundsDetails
        };

        entry.totalSlots += c.totalSlots;
        entry.totalBuyCost += c.totalBuyCost;
        entry.totalPrizeWon += c.totalPrizeWon;
        entry.totalAttachedCost += (c.totalAttachedCost || 0);
        if (c.attachedItems && c.attachedItems.length > 0) {
          entry.attachedItems.push(...c.attachedItems);
        }
        entry.netAmount += c.netAmount;
      });
    }

    const customersList = Object.values(globalCustomerMap).sort((a, b) => b.totalSlots - a.totalSlots);

    return {
      menus,
      totalCustomers: customersList.length,
      grandTotalSlots: customersList.reduce((sum, c) => sum + c.totalSlots, 0),
      grandTotalBuyCost: customersList.reduce((sum, c) => sum + c.totalBuyCost, 0),
      grandTotalPrizeWon: customersList.reduce((sum, c) => sum + c.totalPrizeWon, 0),
      grandTotalAttachedCost: customersList.reduce((sum, c) => sum + c.totalAttachedCost, 0),
      grandNetAmount: customersList.reduce((sum, c) => sum + c.netAmount, 0),
      customers: customersList
    };
  },

  /**
   * Tra cứu nhanh theo tên Khách Hàng (vd: Tìm "Người A")
   * Xem Người A đã vào bao nhiêu slot ở từng Menu và từng Chuyến
   */
  async searchCustomer(customerName, summary = null) {
    if (!customerName) return null;
    const search = require('../views/js/customer-search');
    const allSummary = summary || await this.getAllCustomersSummary();
    const matched = allSummary.customers.filter(c => search.matches(c.customerName, customerName));

    // Lấy chi tiết từng chuyến của khách này
    const results = matched.map(c => {
      const detailedMenus = Object.values(c.menuBreakdown).map(m=>({
        menuId:m.menuId,menuName:m.menuName,slotPrice:m.slotPrice,totalSlots:m.slotCount,
        totalBuyCost:m.buyCost,totalPrizeWon:m.prizeWon,totalAttachedCost:m.attachedCost,
        netAmount:m.net,attachedItems:m.attachedItems,rounds:m.rounds
      }));
      return {
        ...c,
        detailedMenus
      };
    });

    return results;
  },

  /**
   * Tạo chuỗi CSV UTF-8 (có BOM \uFEFF) cho 1 Menu cụ thể
   * Thiết kế 1 bảng thống nhất chuẩn kế toán: STT, Khách, Slots, Tiền Cược, Thưởng, Mỹ Phẩm, Net, Quyết Toán
   */
  async exportMenuReportCsv(menuId) {
    const data = await this.getCustomerStatsByMenu(menuId);
    const menu = data.menu;
    const summary = data.summary;

    let csv = '';
    // Header báo cáo
    csv += `BÁO CÁO QUYẾT TOÁN TÀI CHÍNH KÈO - ${menu.name.toUpperCase()}\n`;
    csv += `Thời Gian Xuất: ${new Date().toLocaleString('vi-VN')}\n`;
    csv += `Đơn Giá Mỗi Slot: ${Number(menu.slot_price).toLocaleString('vi-VN')} đ | Trị Giá Giải Thưởng: ${Number(menu.prize_value).toLocaleString('vi-VN')} đ\n`;
    csv += `Tổng Chuyến: ${summary.totalRounds} (Đã chốt: ${summary.completedRounds}) | Tổng Khách Hàng: ${summary.totalCustomers}\n\n`;

    // TIÊU ĐỀ CỘT CHUẨN
    csv += `STT,Khách Hàng,Số Lượng Slot,Chi Tiết Slot Đã Mua,Đơn Giá Slot (VNĐ),Tổng Tiền Cược (VNĐ) [A],Tiền Thưởng Trúng Kèo (VNĐ) [B],Mỹ Phẩm Mua Kèm,Tiền Mỹ Phẩm (VNĐ) [C],Net Thực Tế (VNĐ) [B - A - C],Trạng Thái Quyết Toán,Ghi Chú Chuyển Khoản\n`;

    data.customers.forEach((c, idx) => {
      const roundsSummary = c.roundsDetails.map(r => `Chuyến ${r.roundNumber} (${r.slotCount} slot: #${r.slots.join('-')})`).join('; ');

      // Gom danh sách mỹ phẩm mua kèm
      let cosmeticsSummary = '(Không có)';
      if (c.attachedItems && c.attachedItems.length > 0) {
        cosmeticsSummary = c.attachedItems.map(item => `${item.name} (x${item.qty || 1})`).join('; ');
      }

      const statusText = c.netAmount > 0 
        ? `Shop trả khách (+${Number(c.netAmount).toLocaleString('vi-VN')} đ)` 
        : c.netAmount < 0 
        ? `Khách trả shop (${Number(Math.abs(c.netAmount)).toLocaleString('vi-VN')} đ)`
        : `Hòa vốn (0 đ)`;

      const transferNote = `[KEO ${menu.name.toUpperCase()}] ${c.customerName} quyet toan`;

      csv += `${idx + 1},"${c.customerName}",${c.totalSlots},"${roundsSummary}",${c.slotPrice},${c.totalBuyCost},${c.totalPrizeWon},"${cosmeticsSummary}",${c.totalAttachedCost || 0},${c.netAmount},"${statusText}","${transferNote}"\n`;
    });

    // Dòng TỔNG CỘNG của bảng
    csv += `TỔNG CỘNG,,${summary.grandTotalSlots},,,${summary.grandTotalBuyCost},${summary.grandTotalPrizeWon},,${summary.grandTotalAttachedCost},${summary.grandNetAmount},,\n\n`;

    // KHUNG TỔNG KẾT TÀI CHÍNH
    const spread = summary.grandTotalBuyCost - summary.grandTotalPrizeWon;
    csv += `BẢNG TỔNG KẾT TÀI CHÍNH MENU - ${menu.name.toUpperCase()}\n`;
    csv += `Chỉ Số Tài Chính,Số Tiền (VNĐ)\n`;
    csv += `Tổng Doanh Thu Slot (A),${summary.grandTotalBuyCost}\n`;
    csv += `Tổng Tiền Thưởng Phát Ra (B),${summary.grandTotalPrizeWon}\n`;
    csv += `Tổng Doanh Thu Mỹ Phẩm (C),${summary.grandTotalAttachedCost}\n`;
    csv += `Chênh Lệch Kèo Cược (A - B),${spread}\n`;
    csv += `Tổng Quyết Toán Net Toàn Menu,${summary.grandNetAmount}\n`;

    return '\uFEFF' + csv;
  },

  /**
   * Tạo chuỗi CSV UTF-8 (có BOM) báo cáo TỔNG HỢP TẤT CẢ CÁC MENU
   */
  async exportAllMenusSummaryCsv() {
    const data = await this.getAllCustomersSummary();
    const menus = data.menus;

    let csv = '';
    csv += `BÁO CÁO TỔNG HỢP TOÀN BỘ CÁC MENU LIVESTREAM\n`;
    csv += `Thời Gian Xuất: ${new Date().toLocaleString('vi-VN')}\n`;
    csv += `Tổng Khách Hàng: ${data.totalCustomers} | Tổng Slot Toàn Bộ: ${data.grandTotalSlots} | Tổng Tiền Cược: ${data.grandTotalBuyCost.toLocaleString('vi-VN')} đ | Tổng Mỹ Phẩm: ${data.grandTotalAttachedCost.toLocaleString('vi-VN')} đ | Net Ròng Toàn Bộ: ${data.grandNetAmount.toLocaleString('vi-VN')} đ\n\n`;

    // Cột tiêu đề
    let header = `STT,Khách Hàng`;
    menus.forEach(m => {
      header += `,"${m.name} (Số Slot)"`;
    });
    header += `,Tổng Slot Toàn Bộ,Tổng Tiền Cược (VNĐ) [A],Tổng Tiền Thưởng (VNĐ) [B],Tổng Tiền Mỹ Phẩm (VNĐ) [C],Net Ròng Thực Tế (VNĐ) [B - A - C],Quyết Toán Cuối Cùng\n`;
    csv += header;

    data.customers.forEach((c, idx) => {
      let row = `${idx + 1},"${c.customerName}"`;
      menus.forEach(m => {
        const mInfo = c.menuBreakdown[m.id];
        const slotCount = mInfo ? mInfo.slotCount : 0;
        row += `,${slotCount}`;
      });

      const finalStatus = c.netAmount > 0 
        ? `Shop trả khách (+${Number(c.netAmount).toLocaleString('vi-VN')} đ)` 
        : c.netAmount < 0 
        ? `Khách trả shop (${Number(Math.abs(c.netAmount)).toLocaleString('vi-VN')} đ)` 
        : `Hòa vốn (0 đ)`;

      row += `,${c.totalSlots},${c.totalBuyCost},${c.totalPrizeWon},${c.totalAttachedCost || 0},${c.netAmount},"${finalStatus}"\n`;
      csv += row;
    });

    // Dòng tổng cộng
    let footer = `TỔNG CỘNG,`;
    menus.forEach(m => {
      const menuSlotTotal = data.customers.reduce((sum, c) => sum + (c.menuBreakdown[m.id]?.slotCount || 0), 0);
      footer += `,${menuSlotTotal}`;
    });
    footer += `,${data.grandTotalSlots},${data.grandTotalBuyCost},${data.grandTotalPrizeWon},${data.grandTotalAttachedCost},${data.grandNetAmount},\n\n`;
    csv += footer;

    // Khung tài chính
    const spread = data.grandTotalBuyCost - data.grandTotalPrizeWon;
    csv += `=== BẢNG TỔNG KẾT TÀI CHÍNH TOÀN BỘ LIVESTREAM ===\n`;
    csv += `Hạng Mục,Số Tiền (VNĐ),Diễn Giải Chi Tiết\n`;
    csv += `1. Tổng Doanh Thu Slot (A),${data.grandTotalBuyCost},"Tổng tiền cược thu từ ${data.grandTotalSlots} slot"\n`;
    csv += `2. Tổng Tiền Thưởng Phát Ra (B),${data.grandTotalPrizeWon},"Tổng giải thưởng trao qua tất cả các menu"\n`;
    csv += `3. Tổng Doanh Thu Mỹ Phẩm (C),${data.grandTotalAttachedCost},"Tổng tiền mỹ phẩm bán kèm cho khách"\n`;
    csv += `4. Chênh Lệch Kèo (A - B),${spread},"${spread >= 0 ? 'Shop thặng dư cược' : 'Shop bù giải thưởng'}"\n`;
    csv += `5. Tổng Net Ròng Toàn Buổi,${data.grandNetAmount},"${data.grandNetAmount > 0 ? 'Shop chi trả ròng cho khách' : 'Shop thực thu ròng từ khách'}"\n`;

    return '\uFEFF' + csv;
  },

  /**
   * Tạo chuỗi CSV chi tiết tất cả các Chuyến (Lịch sử ván cược)
   */
  async exportDetailedRoundsCsv(menuId = null) {
    const rounds = await GameModel.getAllRounds(menuId);

    let csv = '';
    csv += `LỊCH SỬ CHI TIẾT TẤT CẢ CÁC CHUYẾN KÈO\n`;
    csv += `Thời Gian Xuất: ${new Date().toLocaleString('vi-VN')}\n\n`;
    csv += `Chuyến Số,Menu,Tên Chuyến,Trạng Thái,Slot Số,Khách Giữ Slot,Slot Thắng?,Đơn Giá Slot (VNĐ),Thời Gian\n`;

    rounds.forEach(r => {
      (r.slots || []).forEach(s => {
        const selected = winningSlotsFromResults(r.finishedResults) ?? r.winningSlots;
        const winText = Array.isArray(selected) ? (selected.includes(s.slot_number) ? 'SLOT THẮNG' : '') : r.status === 'finished' ? 'Kết quả cũ chưa lưu slot thắng' : '';
        csv += `${r.roundNumber},"${r.menuCode || r.menuId}","${r.name}","${r.status === 'finished' ? 'Đã kết thúc' : 'Đang mở'}",${s.slot_number},"${s.player_name || '(Trống)'}","${winText}",${r.slotPrice},"${new Date(r.createdAt).toLocaleString('vi-VN')}"\n`;
      });
    });

    return '\uFEFF' + csv;
  },

  /**
   * Xuất file CSV chi tiết theo từng khách hàng (vd: Khách A)
   * Bao gồm tất cả các Menu, các Chuyến đã tham gia và các món mỹ phẩm mua kèm
   */
  async exportCustomerDetailCsv(customerName, attachedProducts = []) {
    if (!customerName) throw new Error('Vui lòng chỉ định tên khách hàng!');
    const searchResults = await this.searchCustomer(customerName);
    const customerData = (searchResults || []).find(c => key(c.customerName) === key(customerName));

    let csv = '';
    csv += `BÁO CÁO QUYẾT TOÁN CHI TIẾT KHÁCH HÀNG - [${customerName.toUpperCase()}]\n`;
    csv += `Thời Gian Xuất: ${new Date().toLocaleString('vi-VN')}\n`;
    csv += `Hình thức: Đối soát đa menu, đa chuyến & mỹ phẩm mua kèm\n\n`;

    // PHẦN 1: KÈO CƯỢC SLOT
    csv += `=== PHẦN 1: CHI TIẾT KÈO SLOT THEO TỪNG MENU & TỪNG CHUYẾN ===\n`;
    csv += `STT,Menu Kèo,Chuyến Tham Gia,Số Slot Đã Vào,Chi Tiết Slot,Đơn Giá Slot (VNĐ),Tiền Cược (VNĐ) [A],Tiền Thưởng (VNĐ) [B],Kết Quả Chuyến\n`;

    let totalSlotCount = 0;
    let totalSlotCost = 0;
    let totalPrizeWon = 0;
    let stt = 1;

    if (customerData && customerData.detailedMenus) {
      customerData.detailedMenus.forEach(m => {
        m.rounds.forEach(r => {
          totalSlotCount += r.slotCount;
          totalSlotCost += r.buyCost;
          totalPrizeWon += r.prizeWon;

          const slotsText = r.slots.map(s => '#' + s).join('; ');
          const resultText = r.status !== 'finished' ? 'Chưa chốt' : r.isWinner ? `Trúng giải (+${Number(r.prizeWon).toLocaleString('vi-VN')} đ)` : 'Không trúng (0 đ)';
          csv += `${stt++},"${m.menuName}",Chuyến #${r.roundNumber},${r.slotCount},"${slotsText}",${r.slotPrice ?? m.slotPrice},${r.buyCost},${r.prizeWon},"${resultText}"\n`;
        });
      });
    }

    const netSlot = totalPrizeWon - totalSlotCost;
    csv += `TỔNG CỘNG KÈO SLOT,,,${totalSlotCount},,,${totalSlotCost},${totalPrizeWon},\n\n`;

    // PHẦN 2: SẢN PHẨM MỸ PHẨM MUA KÈM
    csv += `=== PHẦN 2: SẢN PHẨM MỸ PHẨM MUA KÈM ===\n`;
    csv += `STT,Tên Sản Phẩm,Số Lượng,Đơn Giá (VNĐ),Thành Tiền (VNĐ)\n`;

    let totalProductCost = 0;
    // Ưu tiên danh sách mỹ phẩm truyền vào hoặc lấy từ lịch sử khách hàng
    const allAttached = (attachedProducts && attachedProducts.length > 0) 
      ? attachedProducts 
      : (customerData?.attachedItems || []);

    if (allAttached && allAttached.length > 0) {
      allAttached.forEach((p, idx) => {
        const itemTotal = Number(p.price) * Number(p.qty || 1);
        totalProductCost += itemTotal;
        csv += `${idx + 1},"${p.name}",${p.qty || 1},${p.price},${itemTotal}\n`;
      });
    } else {
      csv += `1,"(Không có sản phẩm mỹ phẩm mua kèm)",0,0,0\n`;
    }
    csv += `TỔNG TIỀN MỸ PHẨM,,,,${totalProductCost}\n\n`;

    // PHẦN 3: ĐỐI SOÁT TỔNG HỢP CUỐI CÙNG
    const finalNet = customerData ? customerData.netAmount + (customerData.totalAttachedCost || 0) - totalProductCost : -totalProductCost;
    const finalStatus = finalNet > 0 
      ? `SHOP CẦN CHUYỂN KHOẢN TRẢ KHÁCH (+${Number(finalNet).toLocaleString('vi-VN')} đ)`
      : finalNet < 0 
      ? `KHÁCH CẦN CHUYỂN SHOP (${Number(Math.abs(finalNet)).toLocaleString('vi-VN')} đ)`
      : `HÒA TIỀN CÔNG NỢ (0 đ)`;

    csv += `=== PHẦN 3: ĐỐI SOÁT TỔNG HỢP TÀI CHÍNH CUỐI CÙNG ===\n`;
    csv += `Hạng Mục Tài Chính,Số Tiền (VNĐ),Ghi Chú Đối Soát\n`;
    csv += `1. Tổng tiền mua slot (A),-${totalSlotCost},"Tổng cộng ${totalSlotCount} slot qua tất cả các chuyến"\n`;
    csv += `2. Tổng tiền thưởng trúng kèo (B),+${totalPrizeWon},"Đã cộng dồn tất cả các giải thắng"\n`;
    csv += `3. Tổng tiền mỹ phẩm mua kèm (C),-${totalProductCost},"Tổng cộng ${allAttached.length} món hàng"\n`;
    csv += `SỐ DƯ RÒNG CUỐI CÙNG (NET = B - A - C),${finalNet > 0 ? '+' : ''}${finalNet},"${finalStatus}"\n`;

    return '\uFEFF' + csv;
  }
};

module.exports = ReportModel;
