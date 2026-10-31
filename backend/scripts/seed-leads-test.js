require('dotenv').config();
const leadService = require('../src/services/leadService');

const user = { id: 1, role: 'SUPER_ADMIN', full_name: 'Admin' };

const rows = [
  { full_name: 'Lead Test 1', phone: '0911111111', province: 'Thành phố Hà Nội', customer_type: 'Cá nhân', source: 'Website' },
  { full_name: 'Lead Test 2', phone: '0922222222', province: 'Tp Hồ Chí Minh', customer_type: 'Công ty', source: 'FB Lead' },
  { full_name: 'Lead Test 3', phone: '0933333333', province: 'Tp Đà Nẵng', customer_type: 'Cá nhân', source: 'Hotline' },
  { full_name: 'Lead Test 4', phone: '0944444444', province: 'Tp Hải Phòng', customer_type: 'Công ty', source: 'Khác' },
  { full_name: 'Lead Test 5', phone: '0955555555', province: 'Tỉnh Khánh Hòa', customer_type: 'Cá nhân', source: 'Website' }
];

const run = async () => {
  for (const row of rows) {
    try {
      const lead = await leadService.createLead(row, user, {});
      console.log('Tạo lead:', lead.id || lead.lead_code || 'OK');
    } catch (error) {
      console.error('Lỗi:', row.full_name, error.message);
    }
  }
  process.exit(0);
};

run();
