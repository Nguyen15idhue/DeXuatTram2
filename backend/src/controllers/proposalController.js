const proposalService = require('../services/proposalService');

exports.getAll = async (req, res) => {
  try {
    const proposals = await proposalService.getAllProposals();
    res.json({ success: true, data: proposals });
  } catch (error) {
    console.error('Get proposals error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.getById = async (req, res) => {
  try {
    const proposal = await proposalService.getProposalById(req.params.id);
    if (!proposal) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy đề xuất' });
    }
    res.json({ success: true, data: proposal });
  } catch (error) {
    console.error('Get proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};

exports.create = async (req, res) => {
  try {
    const { latitude, longitude, owner_name, owner_phone, address, area, land_type, description } = req.body;
    const user_id = req.user.id;
    const proposal = await proposalService.createProposal(user_id, latitude, longitude, owner_name, owner_phone, address, area, land_type, description);
    res.status(201).json({ success: true, data: proposal, message: 'Tạo đề xuất thành công' });
  } catch (error) {
    console.error('Create proposal error:', error);
    res.status(500).json({ success: false, message: 'Lỗi server' });
  }
};
