import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { PALETTE } from './ReportWidget';

echarts.use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, DataZoomComponent, CanvasRenderer]);

const ECHART_HEIGHT = 280;

function EChart({ option, height = ECHART_HEIGHT }) {
  const ref = useRef(null);
  const inst = useRef(null);
  useEffect(() => {
    inst.current = echarts.init(ref.current);
    if (ref.current) ref.current.__echart__ = inst.current;
    const onResize = () => { if (inst.current) inst.current.resize(); };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (inst.current) inst.current.dispose();
      inst.current = null;
      if (ref.current) delete ref.current.__echart__;
    };
  }, []);
  useEffect(() => {
    if (inst.current) inst.current.setOption(option, true);
  });
  return <div ref={ref} style={{ width: '100%', height }} />;
}

export function EChartBar({ pairs }) {
  const list = Array.isArray(pairs) ? pairs : [];
  if (list.length === 0) return <p className="text-sm opacity-60">Chưa có số liệu</p>;
  return (
    <EChart
      option={{
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 8, right: 24, top: 12, bottom: 8, containLabel: true },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: list.map((p) => p.name) },
        dataZoom: list.length > 12 ? [{ type: 'slider', yAxisIndex: 0, start: 0, end: Math.round((12 / list.length) * 100) }] : [],
        series: [{
          type: 'bar',
          data: list.map((p, i) => ({ value: p.value, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
        }],
      }}
    />
  );
}

export function DwellWidget({ stages }) {
  const list = Array.isArray(stages) ? stages : [];
  if (list.length === 0) return <p className="text-sm opacity-60">Chưa có số liệu</p>;
  return (
    <EChart
      option={{
        tooltip: {
          trigger: 'axis',
          formatter: (items) => {
            const i = items && items[0] ? items[0].dataIndex : 0;
            const s = list[i] || {};
            return `${s.label || ''}<br/>TB: ${s.avg ?? '—'} ngày<br/>Min: ${s.min ?? '—'}<br/>Max: ${s.max ?? '—'}<br/>Mẫu: ${s.n || 0}`;
          },
        },
        legend: { top: 0 },
        grid: { left: 8, right: 24, top: 32, bottom: 8, containLabel: true },
        xAxis: { type: 'category', data: list.map((s) => s.label) },
        yAxis: { type: 'value', name: 'ngày' },
        series: [
          { name: 'Trung bình', type: 'bar', data: list.map((s) => s.avg), itemStyle: { color: PALETTE[0] } },
          { name: 'Lớn nhất', type: 'line', data: list.map((s) => s.max), itemStyle: { color: PALETTE[3] } },
        ],
      }}
    />
  );
}

export default function EChartWidget({ kind, pairs, stages }) {
  if (kind === 'dwell') return <DwellWidget stages={stages} />;
  return <EChartBar pairs={pairs} />;
}
