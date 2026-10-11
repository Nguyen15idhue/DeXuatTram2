import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export const PALETTE = ['#4f46e5', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6', '#64748b'];

const fmtNum = (v, format) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (format === 'comma') return n.toLocaleString('en-US');
  if (format === 'dot') return n.toLocaleString('de-DE');
  return n.toLocaleString('vi-VN');
};

const buildOption = ({ chartType, rows, showLegend, showLabels, innerRadius, numberFormat }) => {
  const dims = rows.map((r) => (r.dim === null || r.dim === '' ? '(Trống)' : String(r.dim)));
  const vals = rows.map((r) => Number(r.value || 0));
  const symbolSize = 8;

  if (chartType === 'pie' || chartType === 'donut') {
    const radius = chartType === 'donut' ? [`${Math.max(0, innerRadius || 40)}%`, '72%'] : ['0%', '72%'];
    return {
      tooltip: { trigger: 'item', valueFormatter: (v) => fmtNum(v, numberFormat) },
      legend: showLegend ? { bottom: 0, type: 'scroll', textStyle: { fontSize: 11 } } : undefined,
      color: PALETTE,
      series: [{
        type: 'pie',
        radius,
        center: ['50%', '46%'],
        data: rows.map((r, i) => ({ name: dims[i], value: vals[i], itemStyle: { color: PALETTE[i % PALETTE.length] } })),
        label: showLabels ? { formatter: '{b}: {c}', fontSize: 11 } : { show: false },
        labelLine: { show: !!showLabels },
        emphasis: { label: { show: true } },
      }],
    };
  }

  const catAxis = { type: 'category', data: dims, axisLabel: { fontSize: 11, rotate: dims.length > 6 ? 30 : 0 } };
  const valAxis = { type: 'value', axisLabel: { fontSize: 11, formatter: (v) => fmtNum(v, numberFormat) } };
  const base = {
    tooltip: { trigger: 'axis', valueFormatter: (v) => fmtNum(v, numberFormat) },
    grid: { left: 8, right: 14, top: showLegend ? 30 : 12, bottom: 8, containLabel: true },
    legend: showLegend ? { top: 0, textStyle: { fontSize: 11 } } : undefined,
    color: PALETTE,
  };

  if (chartType === 'barH') {
    return { ...base, xAxis: valAxis, yAxis: { ...catAxis, inverse: true }, series: [{ type: 'bar', data: vals, itemStyle: { color: PALETTE[0] }, label: showLabels ? { show: true, position: 'right', fontSize: 10, formatter: (p) => fmtNum(p.value, numberFormat) } : { show: false }, barMaxWidth: 40 }] };
  }
  if (chartType === 'line') {
    return { ...base, xAxis: catAxis, yAxis: valAxis, series: [{ type: 'line', data: vals, smooth: true, symbolSize, areaStyle: { opacity: 0.08 }, itemStyle: { color: PALETTE[0] } }] };
  }
  return { ...base, xAxis: catAxis, yAxis: valAxis, series: [{ type: 'bar', data: vals, itemStyle: { color: PALETTE[0] }, label: showLabels ? { show: true, position: 'top', fontSize: 10, formatter: (p) => fmtNum(p.value, numberFormat) } : { show: false }, barMaxWidth: 48 }] };
};

export default function ChartBox(props) {
  const ref = useRef(null);
  const inst = useRef(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    inst.current = echarts.init(ref.current);
    const ro = new ResizeObserver(() => { if (inst.current) inst.current.resize(); });
    ro.observe(ref.current);
    return () => { ro.disconnect(); if (inst.current) inst.current.dispose(); inst.current = null; };
  }, []);

  useEffect(() => {
    if (inst.current) inst.current.setOption(buildOption(props), true);
  });

  return <div ref={ref} style={{ width: '100%', height: '100%' }} />;
}
