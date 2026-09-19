import { X, GitBranch } from 'lucide-react';

const STEPS = [
  {
    color: '#facc15', title: '1. Đang đề xuất',
    desc: 'Điểm bắt đầu khi tạo đề xuất mới.',
    next: ['Duyệt & đẩy → Đang xem xét (đẩy sang 1Office)', 'Từ chối → yêu cầu sửa lại', 'Hủy → kết thúc']
  },
  {
    color: '#3b82f6', title: '2. Đang xem xét',
    desc: 'Đề xuất đã được đẩy sang 1Office, chờ phản hồi.',
    next: ['1Office duyệt (webhook/demo) → Đã duyệt BCĐX', 'Lưu trữ → ưu tiên thấp, cất kho', 'Hủy → kết thúc']
  },
  {
    color: '#16a34a', title: '3. Đã duyệt BCĐX',
    desc: '1Office đã duyệt. Ký hợp đồng để đi tiếp.',
    next: ['Ký thành công', 'Ký thất bại']
  },
  {
    color: '#0d9488', title: '4. Ký thành công',
    desc: 'Sau 90 ngày (hoặc nút "Tạo trạm" bấm tay) → trở thành Trạm ở trạng thái Triển khai.',
    next: ['Có thể Hủy thủ công trước khi thành trạm']
  },
  {
    color: '#f59e0b', title: '5. Ký thất bại',
    desc: 'Sau 30 ngày tự động chuyển sang Đã hủy.',
    next: ['Có thể Hủy thủ công']
  },
  {
    color: '#8b5cf6', title: '6. Đã lưu trữ',
    desc: 'Duyệt nhưng ưu tiên thấp, cất kho. Vào từ Đang xem xét.',
    next: ['Ký thành công (kích hoạt lại)', 'Hủy → kết thúc']
  },
  {
    color: '#dc2626', title: '7. Từ chối',
    desc: 'Cần chỉnh sửa. CTV sửa xong bấm "Gửi lại" → quay về Đang đề xuất.',
    next: []
  },
  {
    color: '#6b7280', title: '8. Đã hủy',
    desc: 'Trạng thái cuối cùng — không thể mở lại, kể cả admin.',
    next: []
  }
];

const ProposalFlowInfo = ({ onClose }) => (
  <dialog className="modal modal-open">
    <div className="modal-box max-w-lg">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <GitBranch size={18} className="text-primary" />
          Luồng trạng thái đề xuất
        </h3>
        <button className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-3 h-3 rounded-full mt-1 shrink-0" style={{ backgroundColor: s.color }} />
              {i < STEPS.length - 1 && <span className="w-px flex-1 bg-base-300" />}
            </div>
            <div className="pb-4 flex-1">
              <div className="font-semibold text-sm">{s.title}</div>
              <div className="text-xs text-base-content/70 mt-0.5">{s.desc}</div>
              {s.next.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {s.next.map(n => (
                    <li key={n} className="text-xs text-base-content/80">→ {n}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="alert py-2 px-3 mt-2 text-xs">
        <span>Lưu ý: nút "Lấy về từ 1Office" chỉ đồng bộ dữ liệu liên hệ, <b>không</b> làm đổi trạng thái.</span>
      </div>
      <div className="modal-action">
        <button className="btn btn-primary btn-sm" onClick={onClose}>Đã hiểu</button>
      </div>
    </div>
    <div className="modal-backdrop bg-black/50" onClick={onClose} />
  </dialog>
);

export default ProposalFlowInfo;
