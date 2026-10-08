/**
 * MODEL LAYER: Thống Kê Dữ Liệu & Xuất Báo Cáo File Excel (CSV Chuẩn UTF-8 BOM)
 * Phục vụ nghiệp vụ:
 * 1. Tính tổng số slot của Người A (hoặc bất kỳ khách nào) đã vô ở từng Menu (vd Menu 150K)
 * 2. Xuất file riêng cho từng Menu (vd: File Báo Cáo Menu 150K)
 * 3. Xuất file tổng hợp toàn bộ các Menu trong ngày/buổi livestream cho Admin
 */
const MenuModel = require('./MenuModel');
const GameModel = require('./GameModel');

const ReportModel = {
  /**
   * Thống kê chi tiết từng khách hàng theo một Menu cụ thể (vd: Menu 150K)
   * @param {string} menuId 
   */
  async getCustomerStatsByMenu(menuId) {
    const menu = await MenuModel.getMenuById(menuId);
    if (!menu) throw new Error('Menu không tồn tại!');

    // Đảm bảo ván hiện tại của menu này đã được tải/khởi tạo
    await GameModel.getCurrentGame(menu.id);

    const allRounds = GameModel.getAllRounds(menu.id);
    const customerMap = {};

    allRounds.forEach(round => {
      // Nhóm slot theo người chơi trong chuyến này
      const roundPlayers = {};
      round.slots.forEach(s => {
        if (s.player_name) {
          const pName = s.player_name.trim();
          if (!roundPlayers[pName]) roundPlayers[pName] = [];
          roundPlayers[pName].push(s.slot_number);
        }
      });

      // Cộng dồn vào customerMap
      Object.entries(roundPlayers).forEach(([name, slotNums]) => {
        if (!customerMap[name]) {
          customerMap[name] = {
            customerName: name,
            menuId: menu.id,
            menuName: menu.name,
            slotPrice: menu.slot_price,
            totalSlots: 0,
            totalBuyCost: 0,
            totalPrizeWon: 0,
            netAmount: 0,
            roundsCount: 0,
            roundsDetails: []
          };
        }

        const buyCost = slotNums.length * round.slotPrice;
        const isWinner = (round.winners || []).includes(name);
        let prizeWon = 0;
        if (isWinner && round.winners.length > 0) {
          prizeWon = Math.round(round.prizeValue / round.winners.length);
        }
        const net = prizeWon - buyCost;

        customerMap[name].totalSlots += slotNums.length;
        customerMap[name].totalBuyCost += buyCost;
        customerMap[name].totalPrizeWon += prizeWon;
        customerMap[name].netAmount += net;
        customerMap[name].roundsCount += 1;
        customerMap[name].roundsDetails.push({
          roundNumber: round.roundNumber,
          roundName: round.name,
          slots: slotNums,
          slotCount: slotNums.length,
          buyCost,
          isWinner,
          prizeWon,
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
      totalRounds: allRounds.length,
      completedRounds: allRounds.filter(r => r.status === 'finished').length,
      totalCustomers: customers.length,
      grandTotalSlots: customers.reduce((sum, c) => sum + c.totalSlots, 0),
      grandTotalBuyCost: customers.reduce((sum, c) => sum + c.totalBuyCost, 0),
      grandTotalPrizeWon: customers.reduce((sum, c) => sum + c.totalPrizeWon, 0),
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
        occupiedSlots: r.slots.filter(s => s.player_name).length,
        winners: r.winners || [],
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
    const globalCustomerMap = {};

    for (const menu of menus) {
      const { customers } = await this.getCustomerStatsByMenu(menu.id);
      customers.forEach(c => {
        if (!globalCustomerMap[c.customerName]) {
          globalCustomerMap[c.customerName] = {
            customerName: c.customerName,
            menuBreakdown: {}, // { [menuId]: { menuName, slotCount, buyCost, prizeWon, net } }
            totalSlots: 0,
            totalBuyCost: 0,
            totalPrizeWon: 0,
            netAmount: 0
          };
        }

        const entry = globalCustomerMap[c.customerName];
        entry.menuBreakdown[menu.id] = {
          menuId: menu.id,
          menuName: menu.name,
          slotPrice: menu.slot_price,
          slotCount: c.totalSlots,
          buyCost: c.totalBuyCost,
          prizeWon: c.totalPrizeWon,
          net: c.netAmount,
          roundsCount: c.roundsCount
        };

        entry.totalSlots += c.totalSlots;
        entry.totalBuyCost += c.totalBuyCost;
        entry.totalPrizeWon += c.totalPrizeWon;
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
      grandNetAmount: customersList.reduce((sum, c) => sum + c.netAmount, 0),
      customers: customersList
    };
  },

  /**
   * Tra cứu nhanh theo tên Khách Hàng (vd: Tìm "Người A")
   * Xem Người A đã vào bao nhiêu slot ở từng Menu và từng Chuyến
   */
  async searchCustomer(customerName) {
    if (!customerName) return null;
    const query = customerName.toLowerCase().trim();
    const allSummary = await this.getAllCustomersSummary();
    const matched = allSummary.customers.filter(c => c.customerName.toLowerCase().includes(query));

    // Lấy chi tiết từng chuyến của khách này
    const results = await Promise.all(matched.map(async c => {
      const detailedMenus = [];
      for (const menu of allSummary.menus) {
        const menuStats = await this.getCustomerStatsByMenu(menu.id);
        const thisCust = menuStats.customers.find(x => x.customerName.toLowerCase() === c.customerName.toLowerCase());
        if (thisCust) {
          detailedMenus.push({
            menuId: menu.id,
            menuName: menu.name,
            slotPrice: menu.slot_price,
            totalSlots: thisCust.totalSlots,
            totalBuyCost: thisCust.totalBuyCost,
            totalPrizeWon: thisCust.totalPrizeWon,
            netAmount: thisCust.netAmount,
            rounds: thisCust.roundsDetails
          });
        }
      }
      return {
        ...c,
        detailedMenus
      };
    }));

    return results;
  },

  /**
   * Tạo chuỗi CSV UTF-8 (có BOM \uFEFF) cho 1 Menu cụ thể
   * Mở bằng Excel tiếng Việt hoàn hảo 100% không bị vỡ font!
   */
  async exportMenuReportCsv(menuId) {
    const data = await this.getCustomerStatsByMenu(menuId);
    const menu = data.menu;
    const summary = data.summary;

    let csv = '';
    // Tiêu đề báo cáo
    csv += `BÁO CÁO TỔNG KẾT KÈO THEO MENU - ${menu.name.toUpperCase()}\n`;
    csv += `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\n`;
    csv += `Giá mỗi slot: ${menu.slot_price.toLocaleString('vi-VN')} đ | Tổng giải thưởng: ${menu.prize_value.toLocaleString('vi-VN')} đ\n`;
    csv += `Tổng số chuyến đã chạy: ${summary.totalRounds} | Tổng slot đã bán: ${summary.grandTotalSlots} | Tổng tiền cược: ${summary.grandTotalBuyCost.toLocaleString('vi-VN')} đ\n`;
    csv += `\n`;

    // BẢNG 1: TỔNG HỢP THEO TỪNG KHÁCH HÀNG
    csv += `=== BẢNG 1: TỔNG HỢP THEO KHÁCH HÀNG (MENU ${menu.name}) ===\n`;
    csv += `STT,Khách Hàng,Tổng Số Slot Đã Vào,Chi Tiết Các Chuyến,Tổng Tiền Cược (VNĐ),Tổng Tiền Thưởng (VNĐ),Net Thực Tế (VNĐ),Trạng Thái Quyết Toán\n`;

    data.customers.forEach((c, idx) => {
      const roundsSummary = c.roundsDetails.map(r => `Chuyến ${r.roundNumber} (${r.slotCount} slot: #${r.slots.join('-')})`).join('; ');
      const statusText = c.netAmount > 0 
        ? `Shop chuyển khoản trả khách (+${c.netAmount.toLocaleString('vi-VN')} đ)` 
        : c.netAmount < 0 
        ? `Khách cần chuyển shop (${Math.abs(c.netAmount).toLocaleString('vi-VN')} đ)`
        : `Hòa vốn (0 đ)`;

      csv += `${idx + 1},"${c.customerName}",${c.totalSlots},"${roundsSummary}",${c.totalBuyCost},${c.totalPrizeWon},${c.netAmount},"${statusText}"\n`;
    });

    csv += `TỔNG CỘNG,,${summary.grandTotalSlots},,${summary.grandTotalBuyCost},${summary.grandTotalPrizeWon},${summary.grandNetAmount},\n\n`;

    // BẢNG 2: CHI TIẾT TỪNG CHUYẾN
    csv += `=== BẢNG 2: CHI TIẾT TỪNG CHUYẾN CỦA MENU ===\n`;
    csv += `Chuyến Số,Tên Chuyến,Trạng Thái,Số Slot Đã Điền,Người Thắng Cuộc,Tổng Giá Trị Giải (VNĐ),Thời Gian\n`;

    data.rounds.forEach(r => {
      const winnersText = (r.winners || []).join(', ') || 'Chưa chốt';
      csv += `${r.roundNumber},"${r.name}","${r.status === 'finished' ? 'Đã kết thúc' : 'Đang mở'}",${r.occupiedSlots}/${r.totalSlots},"${winnersText}",${r.prizeValue},"${new Date(r.createdAt).toLocaleString('vi-VN')}"\n`;
    });

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
    csv += `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\n`;
    csv += `Tổng khách hàng: ${data.totalCustomers} | Tổng slot toàn bộ: ${data.grandTotalSlots} | Tổng cược: ${data.grandTotalBuyCost.toLocaleString('vi-VN')} đ | Net toàn bộ: ${data.grandNetAmount.toLocaleString('vi-VN')} đ\n`;
    csv += `\n`;

    // Dòng tiêu đề cột: STT, Khách Hàng, [Menu 150K Slots], [Menu 200K Slots]..., Tổng Slot, Tổng Cược, Tổng Thưởng, Net Ròng, Quyết Toán
    let header = `STT,Khách Hàng`;
    menus.forEach(m => {
      header += `,"${m.name} (Số Slot)"`;
    });
    header += `,Tổng Slot Toàn Bộ,Tổng Tiền Cược (VNĐ),Tổng Tiền Thưởng (VNĐ),Net Ròng Thực Tế (VNĐ),Quyết Toán Cuối Cùng\n`;
    csv += header;

    data.customers.forEach((c, idx) => {
      let row = `${idx + 1},"${c.customerName}"`;
      menus.forEach(m => {
        const mInfo = c.menuBreakdown[m.id];
        const slotCount = mInfo ? mInfo.slotCount : 0;
        row += `,${slotCount}`;
      });

      const finalStatus = c.netAmount > 0 
        ? `Shop trả khách (+${c.netAmount.toLocaleString('vi-VN')} đ)` 
        : c.netAmount < 0 
        ? `Khách trả shop (${Math.abs(c.netAmount).toLocaleString('vi-VN')} đ)` 
        : `Hòa vốn`;

      row += `,${c.totalSlots},${c.totalBuyCost},${c.totalPrizeWon},${c.netAmount},"${finalStatus}"\n`;
      csv += row;
    });

    // Dòng tổng cộng
    let footer = `TỔNG CỘNG,`;
    menus.forEach(m => {
      const menuSlotTotal = data.customers.reduce((sum, c) => sum + (c.menuBreakdown[m.id]?.slotCount || 0), 0);
      footer += `,${menuSlotTotal}`;
    });
    footer += `,${data.grandTotalSlots},${data.grandTotalBuyCost},${data.grandTotalPrizeWon},${data.grandNetAmount},\n`;
    csv += footer;

    return '\uFEFF' + csv;
  },

  /**
   * Tạo chuỗi CSV chi tiết tất cả các Chuyến (Lịch sử ván cược)
   */
  async exportDetailedRoundsCsv(menuId = null) {
    const rounds = GameModel.getAllRounds(menuId);

    let csv = '';
    csv += `LỊCH SỬ CHI TIẾT TẤT CẢ CÁC CHUYẾN KÈO\n`;
    csv += `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\n\n`;
    csv += `Chuyến Số,Menu,Tên Chuyến,Trạng Thái,Slot Số,Khách Giữ Slot,Người Thắng?,Tiền Slot (VNĐ)\n`;

    rounds.forEach(r => {
      r.slots.forEach(s => {
        const isWinner = s.player_name && (r.winners || []).includes(s.player_name);
        csv += `${r.roundNumber},"${r.menuCode || r.menuId}","${r.name}","${r.status}",${s.slot_number},"${s.player_name || '(Trống)'}","${isWinner ? 'WINNER' : ''}",${r.slotPrice}\n`;
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
    const customerData = (searchResults && searchResults.length > 0) ? searchResults[0] : null;

    let csv = '';
    csv += `BÁO CÁO QUYẾT TOÁN CHI TIẾT KHÁCH HÀNG - [${customerName.toUpperCase()}]\n`;
    csv += `Thời gian xuất: ${new Date().toLocaleString('vi-VN')}\n`;
    csv += `Trạng thái: Quyết toán đa menu, đa chuyến & mỹ phẩm mua kèm\n\n`;

    // PHẦN 1: KÈO CƯỢC SLOT
    csv += `=== PHẦN 1: CHI TIẾT KÈO SLOT THEO TỪNG MENU & TỪNG CHUYẾN ===\n`;
    csv += `STT,Menu Kèo,Chuyến Tham Gia,Số Slot Đã Vào,Chi Tiết Slot,Tiền Mua Slot (VNĐ),Tiền Thưởng (VNĐ),Net Kèo (VNĐ),Kết Quả Chuyến\n`;

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
          const resultText = r.isWinner ? `Thắng (+${r.prizeWon.toLocaleString('vi-VN')} đ)` : 'Không trúng (0 đ)';
          csv += `${stt++},"${m.menuName}",Chuyến #${r.roundNumber},${r.slotCount},"${slotsText}",${r.buyCost},${r.prizeWon},${r.net},"${resultText}"\n`;
        });
      });
    }

    const netSlot = totalPrizeWon - totalSlotCost;
    csv += `TỔNG CỘNG KÈO SLOT,,,${totalSlotCount},,${totalSlotCost},${totalPrizeWon},${netSlot},\n\n`;

    // PHẦN 2: SẢN PHẨM MỸ PHẨM MUA KÈM
    csv += `=== PHẦN 2: SẢN PHẨM MỸ PHẨM MUA KÈM ===\n`;
    csv += `STT,Tên Sản Phẩm,Số Lượng,Đơn Giá (VNĐ),Thành Tiền (VNĐ)\n`;

    let totalProductCost = 0;
    if (attachedProducts && attachedProducts.length > 0) {
      attachedProducts.forEach((p, idx) => {
        const itemTotal = Number(p.price) * Number(p.qty || 1);
        totalProductCost += itemTotal;
        csv += `${idx + 1},"${p.name}",${p.qty || 1},${p.price},${itemTotal}\n`;
      });
    } else {
      csv += `1,"(Không có sản phẩm mỹ phẩm mua kèm)",0,0,0\n`;
    }
    csv += `TỔNG TIỀN MỸ PHẨM,,,,${totalProductCost}\n\n`;

    // PHẦN 3: ĐỐI SOÁT TỔNG HỢP CUỐI CÙNG
    const finalNet = (totalPrizeWon - totalSlotCost) - totalProductCost;
    const finalStatus = finalNet > 0 
      ? `SHOP CẦN CHUYỂN KHOẢN TRẢ KHÁCH (+${finalNet.toLocaleString('vi-VN')} đ)`
      : finalNet < 0 
      ? `KHÁCH CẦN CHUYỂN SHOP (${Math.abs(finalNet).toLocaleString('vi-VN')} đ)`
      : `HÒA TIỀN CÔNG NỢ (0 đ)`;

    csv += `=== PHẦN 3: ĐỐI SOÁT TỔNG HỢP TÀI CHÍNH CUỐI CÙNG ===\n`;
    csv += `Hạng Mục,Số Tiền (VNĐ),Ghi Chú Đối Soát\n`;
    csv += `Tổng tiền cược mua slot,-${totalSlotCost},"Tổng cộng ${totalSlotCount} slot qua các chuyến"\n`;
    csv += `Tổng tiền thưởng trúng kèo,+${totalPrizeWon},"Đã cộng dồn tất cả các giải thắng"\n`;
    csv += `Tổng tiền mỹ phẩm mua kèm,-${totalProductCost},"Tổng cộng ${attachedProducts.length} sản phẩm"\n`;
    csv += `SỐ DƯ RÒNG CUỐI CÙNG (NET),${finalNet > 0 ? '+' : ''}${finalNet},"${finalStatus}"\n`;

    return '\uFEFF' + csv;
  }
};

module.exports = ReportModel;
