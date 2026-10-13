import { Inbox } from 'lucide-react';

const EmptyState = ({
  icon: Icon = Inbox,
  title = 'Không có dữ liệu',
  description = '',
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="p-4 rounded-full bg-base-200 mb-4">
        <Icon size={48} className="text-base-content/30" />
      </div>
      <h3 className="text-lg font-medium text-base-content mb-1">{title}</h3>
      {description && <p className="text-sm text-base-content/60 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
