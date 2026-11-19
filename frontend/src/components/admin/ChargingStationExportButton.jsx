import { useState } from 'react';
import { Download } from 'lucide-react';
import { chargingStationService } from '../../services/api';
import { Button, Toast } from '../ui';

const ChargingStationExportButton = ({ stage, tab, search, token, disabled }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setError('');
    setBusy(true);
    try {
      await chargingStationService.exportExcel({ stage, tab, search }, token);
    } catch (error) {
      setError(error.message || 'Không thể xuất Excel ON trạm');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <Button type="button" variant="outline" loading={busy} disabled={disabled || !token}
      onClick={download}>
      {!busy && <Download size={16} />}
      {busy ? 'Đang xuất…' : 'Xuất Excel'}
    </Button>
    <Toast message={error} type="error" onClose={() => setError('')} />
  </>;
};

export default ChargingStationExportButton;
