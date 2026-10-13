import { Loader2 } from 'lucide-react';

const Loading = ({ message = 'Đang tải...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 className="animate-spin text-primary" size={32} />
      <p className="text-sm text-base-content/60">{message}</p>
    </div>
  );
};

export default Loading;
