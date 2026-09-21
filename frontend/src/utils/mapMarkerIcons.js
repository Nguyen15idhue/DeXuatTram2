import { fieldDefinitionService } from '../services/api';

// Bộ icon marker bản đồ — SVG dẹt tự màu (phong cách phẳng/gradient), viewBox 24.
// Mỗi icon: { defs?: string, nodes: [[tag, attrs], ...] }
const ICONS = {
  // ===== Nhóm 1: Trạm & năng lượng =====
  bolt: {
    nodes: [['path', { d: 'M13.5 2 5 13.2h5.2L9.4 22 19 10.4h-5.3z', fill: '#facc15', stroke: '#ca8a04', 'stroke-width': '1', 'stroke-linejoin': 'round' }]],
  },
  plug: {
    nodes: [
      ['path', { d: 'M9 2v5', stroke: '#0284c7', 'stroke-width': '2.6', 'stroke-linecap': 'round' }],
      ['path', { d: 'M15 2v5', stroke: '#0284c7', 'stroke-width': '2.6', 'stroke-linecap': 'round' }],
      ['path', { d: 'M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0z', fill: '#38bdf8' }],
      ['path', { d: 'M12 16v6', stroke: '#0284c7', 'stroke-width': '2.6', 'stroke-linecap': 'round' }],
    ],
  },
  battery: {
    nodes: [
      ['rect', { x: '2.5', y: '7', width: '16.5', height: '10', rx: '2.5', fill: '#22c55e' }],
      ['path', { d: 'M20.6 10h1.2a1.6 1.6 0 0 1 0 4h-1.2z', fill: '#16a34a' }],
      ['path', { d: 'M11.2 8.6 7.4 13.2h3l-.8 3.3 4.2-5h-3.1z', fill: '#ffffff' }],
    ],
  },
  batteryLow: {
    defs: '<linearGradient id="g-battlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f87171"/><stop offset="1" stop-color="#dc2626"/></linearGradient>',
    nodes: [
      ['rect', { x: '2.5', y: '7', width: '16.5', height: '10', rx: '2.5', fill: 'url(#g-battlow)' }],
      ['path', { d: 'M20.6 10h1.2a1.6 1.6 0 0 1 0 4h-1.2z', fill: '#991b1b' }],
      ['rect', { x: '5', y: '10', width: '3.4', height: '4', rx: '0.6', fill: '#ffffff' }],
    ],
  },
  evStation: {
    defs: '<linearGradient id="g-ev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#16a34a"/></linearGradient>',
    nodes: [
      ['rect', { x: '7.2', y: '2.8', width: '9.6', height: '17', rx: '3', fill: 'url(#g-ev)' }],
      ['rect', { x: '4.6', y: '19.4', width: '14.8', height: '2.4', rx: '1.2', fill: '#14532d' }],
      ['rect', { x: '9.3', y: '5.4', width: '5.4', height: '3.8', rx: '1', fill: '#ffffff' }],
      ['path', { d: 'm12.8 10.4-2.4 4.2h1.9l-.7 3.4 2.9-4.4h-2z', fill: '#fbbf24' }],
    ],
  },
  solar: {
    defs: '<linearGradient id="g-sol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>',
    nodes: [
      ['circle', { cx: '17.2', cy: '6.6', r: '3.1', fill: '#fde047', stroke: '#f59e0b', 'stroke-width': '1' }],
      ['path', { d: 'M17.2 1.6v1.6M22 6.6h-1.6M20.6 3.2l-1.2 1.2M20.6 10l-1.2-1.2M13.8 3.2l1.2 1.2', stroke: '#f59e0b', 'stroke-width': '1.5', 'stroke-linecap': 'round' }],
      ['rect', { x: '2.8', y: '13', width: '11.6', height: '6.6', rx: '1', fill: 'url(#g-sol)' }],
      ['path', { d: 'M6.7 13.2v6.2M10.5 13.2v6.2M3 16.3h11.2', stroke: '#bfdbfe', 'stroke-width': '1' }],
      ['path', { d: 'M8.6 19.6v1.8', stroke: '#1e40af', 'stroke-width': '1.6' }],
    ],
  },
  meter: {
    defs: '<linearGradient id="g-met" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2e8f0"/><stop offset="1" stop-color="#94a3b8"/></linearGradient>',
    nodes: [
      ['rect', { x: '3.4', y: '3.4', width: '17.2', height: '14.6', rx: '2.4', fill: 'url(#g-met)', stroke: '#475569', 'stroke-width': '1' }],
      ['rect', { x: '6', y: '6', width: '12', height: '5.4', rx: '1', fill: '#0f172a' }],
      ['path', { d: 'm12.8 6.9-2 3.6h1.5l-.4 1.5 2.1-3.6h-1.6z', fill: '#fde047' }],
      ['circle', { cx: '12', cy: '14.7', r: '2.1', fill: '#f8fafc', stroke: '#475569', 'stroke-width': '0.8' }],
      ['path', { d: 'm12 14.7 1.3-1.1', stroke: '#dc2626', 'stroke-width': '1' }],
      ['path', { d: 'M7 18v2.6M17 18v2.6', stroke: '#64748b', 'stroke-width': '1.8', 'stroke-linecap': 'round' }],
    ],
  },

  // ===== Nhóm 2: Trạng thái & quy trình =====
  flag: {
    nodes: [
      ['path', { d: 'M6 21.5V3.6', stroke: '#475569', 'stroke-width': '2.4', 'stroke-linecap': 'round' }],
      ['path', { d: 'M6.6 4.4c3.2-2.1 6.4 1.7 12.4-.5v8.5c-6 2.2-9.2-1.6-12.4.5z', fill: '#ef4444' }],
    ],
  },
  wrench: {
    nodes: [['path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z', fill: '#64748b' }]],
  },
  clock: {
    nodes: [
      ['circle', { cx: '12', cy: '12', r: '9.2', fill: '#f97316' }],
      ['path', { d: 'M12 6.8V12l3.6 1.8', stroke: '#ffffff', 'stroke-width': '2.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }],
    ],
  },
  hourglass: {
    defs: '<linearGradient id="g-hg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>',
    nodes: [
      ['path', { d: 'M6.6 2.6h10.8M6.6 21.4h10.8', stroke: '#92400e', 'stroke-width': '2', 'stroke-linecap': 'round' }],
      ['path', { d: 'M8 3.6v3.2c0 2 1.7 3.2 4 4.3 2.3-1.1 4-2.3 4-4.3V3.6z', fill: 'url(#g-hg)' }],
      ['path', { d: 'M8 20.4v-3.2c0-2 1.7-3.2 4-4.3 2.3 1.1 4 2.3 4 4.3v3.2z', fill: 'url(#g-hg)' }],
    ],
  },
  search: {
    nodes: [
      ['circle', { cx: '10.5', cy: '10.5', r: '6.3', fill: '#eef2ff', stroke: '#6366f1', 'stroke-width': '2.6' }],
      ['path', { d: 'm19.6 19.6-4.4-4.4', stroke: '#6366f1', 'stroke-width': '3', 'stroke-linecap': 'round' }],
    ],
  },
  eye: {
    defs: '<linearGradient id="g-eye" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>',
    nodes: [
      ['path', { d: 'M2.6 12S6 6.4 12 6.4 21.4 12 21.4 12 18 17.6 12 17.6 2.6 12 2.6 12z', fill: '#eff6ff', stroke: '#334155', 'stroke-width': '1.2' }],
      ['circle', { cx: '12', cy: '12', r: '3.4', fill: 'url(#g-eye)' }],
      ['circle', { cx: '12', cy: '12', r: '1.4', fill: '#0f172a' }],
    ],
  },
  clipboard: {
    defs: '<linearGradient id="g-cb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d97706"/><stop offset="1" stop-color="#92400c"/></linearGradient>',
    nodes: [
      ['rect', { x: '4.6', y: '3.6', width: '14.8', height: '17.2', rx: '2', fill: 'url(#g-cb)' }],
      ['rect', { x: '6.8', y: '6.2', width: '10.4', height: '12.2', rx: '1', fill: '#ffffff' }],
      ['rect', { x: '9.4', y: '2.2', width: '5.2', height: '3', rx: '1.2', fill: '#475569' }],
      ['path', { d: 'm9.6 12.6 1.9 1.9 3.7-4.4', stroke: '#16a34a', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }],
    ],
  },
  document: {
    defs: '<linearGradient id="g-doc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="#cbd5e1"/></linearGradient>',
    nodes: [
      ['path', { d: 'M6 2.8h8.4L19 7.4V21a1.2 1.2 0 0 1-1.2 1.2H6A1.2 1.2 0 0 1 4.8 21V4A1.2 1.2 0 0 1 6 2.8z', fill: 'url(#g-doc)', stroke: '#64748b', 'stroke-width': '1' }],
      ['path', { d: 'M14.2 2.8v4.6H19', fill: 'none', stroke: '#64748b', 'stroke-width': '1' }],
      ['path', { d: 'M8 11.4h7.6M8 14.4h7.6M8 17.4h5', stroke: '#64748b', 'stroke-width': '1.2', 'stroke-linecap': 'round' }],
    ],
  },
  check: {
    nodes: [
      ['circle', { cx: '12', cy: '12', r: '9.2', fill: '#16a34a' }],
      ['path', { d: 'm7.6 12.4 3 3 5.8-6.4', stroke: '#ffffff', 'stroke-width': '2.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }],
    ],
  },
  cross: {
    nodes: [
      ['circle', { cx: '12', cy: '12', r: '9.2', fill: '#dc2626' }],
      ['path', { d: 'm8.2 8.2 7.6 7.6', stroke: '#ffffff', 'stroke-width': '2.6', 'stroke-linecap': 'round' }],
      ['path', { d: 'm15.8 8.2-7.6 7.6', stroke: '#ffffff', 'stroke-width': '2.6', 'stroke-linecap': 'round' }],
    ],
  },
  alert: {
    nodes: [
      ['path', { d: 'M12 4.2 2.9 19.8h18.2z', fill: '#f59e0b', stroke: '#f59e0b', 'stroke-width': '2.4', 'stroke-linejoin': 'round' }],
      ['path', { d: 'M12 9.6v4.4', stroke: '#ffffff', 'stroke-width': '2.2', 'stroke-linecap': 'round' }],
      ['circle', { cx: '12', cy: '16.9', r: '1.2', fill: '#ffffff' }],
    ],
  },
  info: {
    defs: '<linearGradient id="g-info" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>',
    nodes: [
      ['circle', { cx: '12', cy: '12', r: '9.4', fill: 'url(#g-info)' }],
      ['circle', { cx: '12', cy: '7.8', r: '1.4', fill: '#ffffff' }],
      ['rect', { x: '10.7', y: '10.6', width: '2.6', height: '6.4', rx: '1.3', fill: '#ffffff' }],
    ],
  },
  play: {
    defs: '<linearGradient id="g-play" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#15803d"/></linearGradient>',
    nodes: [
      ['circle', { cx: '12', cy: '12', r: '9.4', fill: 'url(#g-play)' }],
      ['path', { d: 'm9.8 7.6 7 4.4-7 4.4z', fill: '#ffffff' }],
    ],
  },
  pause: {
    defs: '<linearGradient id="g-pau" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#d97706"/></linearGradient>',
    nodes: [
      ['circle', { cx: '12', cy: '12', r: '9.4', fill: 'url(#g-pau)' }],
      ['rect', { x: '8.4', y: '7.6', width: '2.6', height: '8.8', rx: '0.9', fill: '#ffffff' }],
      ['rect', { x: '13', y: '7.6', width: '2.6', height: '8.8', rx: '0.9', fill: '#ffffff' }],
    ],
  },
  stop: {
    defs: '<linearGradient id="g-stop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f87171"/><stop offset="1" stop-color="#b91c1c"/></linearGradient>',
    nodes: [
      ['path', { d: 'M8.6 2.8h6.8l5.8 5.8v6.8l-5.8 5.8H8.6L2.8 15.4V8.6z', fill: 'url(#g-stop)' }],
      ['rect', { x: '8', y: '10.7', width: '8', height: '2.6', rx: '0.8', fill: '#ffffff' }],
    ],
  },
  ban: {
    nodes: [
      ['circle', { cx: '12', cy: '12', r: '7.4', fill: '#fef2f2', stroke: '#dc2626', 'stroke-width': '2.8' }],
      ['path', { d: 'm6.8 6.8 10.4 10.4', stroke: '#dc2626', 'stroke-width': '2.8', 'stroke-linecap': 'round' }],
    ],
  },
  lock: {
    defs: '<linearGradient id="g-lock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#94a3b8"/><stop offset="1" stop-color="#475569"/></linearGradient>',
    nodes: [
      ['path', { d: 'M8.4 10V8.2a3.6 3.6 0 0 1 7.2 0V10', stroke: '#64748b', 'stroke-width': '2.2', fill: 'none' }],
      ['rect', { x: '5.6', y: '10', width: '12.8', height: '10.4', rx: '2.2', fill: 'url(#g-lock)' }],
      ['circle', { cx: '12', cy: '14', r: '1.5', fill: '#fbbf24' }],
      ['rect', { x: '11.3', y: '14', width: '1.4', height: '3.4', rx: '0.7', fill: '#fbbf24' }],
    ],
  },
  bell: {
    defs: '<linearGradient id="g-bell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>',
    nodes: [
      ['path', { d: 'M12 3a5.6 5.6 0 0 1 5.6 5.6v3l1.6 2.8H4.8l1.6-2.8v-3A5.6 5.6 0 0 1 12 3z', fill: 'url(#g-bell)' }],
      ['circle', { cx: '12', cy: '2.4', r: '1', fill: '#92400e' }],
      ['circle', { cx: '12', cy: '17.4', r: '1.8', fill: '#92400e' }],
    ],
  },

  // ===== Nhóm 3: Địa điểm & hạ tầng =====
  pin: {
    nodes: [
      ['path', { d: 'M12 2a7.2 7.2 0 0 0-7.2 7.2C4.8 15 12 22 12 22s7.2-7 7.2-12.8A7.2 7.2 0 0 0 12 2z', fill: '#3b82f6' }],
      ['circle', { cx: '12', cy: '9', r: '2.7', fill: '#ffffff' }],
    ],
  },
  home: {
    defs: '<linearGradient id="g-home" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#d97706"/></linearGradient>',
    nodes: [
      ['polygon', { points: '12,2.6 21.6,10.6 19.8,12.6 12,6.6 4.2,12.6 2.4,10.6', fill: '#dc2626' }],
      ['rect', { x: '5.6', y: '10.8', width: '12.8', height: '10.4', fill: 'url(#g-home)' }],
      ['rect', { x: '10.6', y: '14', width: '2.8', height: '7.2', rx: '0.5', fill: '#7c2d12' }],
    ],
  },
  building: {
    defs: '<linearGradient id="g-bld" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#2563eb"/></linearGradient>',
    nodes: [
      ['rect', { x: '5', y: '2.8', width: '9.6', height: '17.8', fill: 'url(#g-bld)' }],
      ['rect', { x: '14.6', y: '8', width: '4.6', height: '12.6', fill: '#93c5fd' }],
      ['rect', { x: '6.8', y: '5', width: '2', height: '2.2', rx: '0.4', fill: '#eff6ff' }],
      ['rect', { x: '10.8', y: '5', width: '2', height: '2.2', rx: '0.4', fill: '#eff6ff' }],
      ['rect', { x: '6.8', y: '9', width: '2', height: '2.2', rx: '0.4', fill: '#eff6ff' }],
      ['rect', { x: '10.8', y: '9', width: '2', height: '2.2', rx: '0.4', fill: '#eff6ff' }],
      ['rect', { x: '8.8', y: '15.6', width: '2.4', height: '5', fill: '#1e3a8a' }],
      ['rect', { x: '15.8', y: '10', width: '2.2', height: '2.2', rx: '0.4', fill: '#dbeafe' }],
    ],
  },
  factory: {
    defs: '<linearGradient id="g-fac" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#94a3b8"/><stop offset="1" stop-color="#475569"/></linearGradient>',
    nodes: [
      ['rect', { x: '5.4', y: '3.6', width: '2.2', height: '8', rx: '0.5', fill: '#64748b' }],
      ['rect', { x: '9', y: '5', width: '2.2', height: '6.6', rx: '0.5', fill: '#64748b' }],
      ['circle', { cx: '6.5', cy: '2.4', r: '1.1', fill: '#cbd5e1' }],
      ['rect', { x: '3.2', y: '11.4', width: '17.6', height: '9.4', fill: 'url(#g-fac)' }],
      ['rect', { x: '13.2', y: '13.6', width: '2.4', height: '2.4', rx: '0.4', fill: '#fde68a' }],
      ['rect', { x: '16.8', y: '13.6', width: '2.4', height: '2.4', rx: '0.4', fill: '#fde68a' }],
      ['rect', { x: '5.4', y: '15.4', width: '3.2', height: '5.4', fill: '#1e293b' }],
    ],
  },
  store: {
    defs: '<linearGradient id="g-st" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f87171"/><stop offset="1" stop-color="#dc2626"/></linearGradient>',
    nodes: [
      ['path', { d: 'M3.6 4.6h16.8l1.4 4.8H2.2z', fill: 'url(#g-st)' }],
      ['rect', { x: '4.6', y: '9.4', width: '14.8', height: '11.4', fill: '#f1f5f9', stroke: '#64748b', 'stroke-width': '1' }],
      ['rect', { x: '10.4', y: '13.6', width: '3.2', height: '7.2', rx: '0.5', fill: '#0ea5e9' }],
      ['rect', { x: '6.4', y: '11.8', width: '2.8', height: '3', rx: '0.4', fill: '#bae6fd' }],
    ],
  },
  parkingP: {
    defs: '<linearGradient id="g-park" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1e40af"/></linearGradient>',
    nodes: [
      ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '4', fill: 'url(#g-park)' }],
      ['path', { d: 'M9.6 17.2V7.4h3.8a2.9 2.9 0 0 1 0 5.8H9.6', fill: 'none', stroke: '#ffffff', 'stroke-width': '2.4', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ],
  },
  cone: {
    defs: '<linearGradient id="g-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fb923c"/><stop offset="1" stop-color="#ea580c"/></linearGradient>',
    nodes: [
      ['path', { d: 'M10.6 2.6h2.8l1 4.4H9.6z', fill: 'url(#g-cone)' }],
      ['path', { d: 'M9.4 7.4h5.2l2.8 10.8H6.6z', fill: 'url(#g-cone)' }],
      ['path', { d: 'M8.5 11.4h7l.6 2.4H7.9z', fill: '#ffffff' }],
      ['rect', { x: '4.4', y: '18.2', width: '15.2', height: '2.8', rx: '1.4', fill: '#c2410c' }],
    ],
  },
  road: {
    defs: '<linearGradient id="g-road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#64748b"/><stop offset="1" stop-color="#374151"/></linearGradient>',
    nodes: [
      ['path', { d: 'M9.8 3.4 5.4 20.6h13.2L14.2 3.4z', fill: 'url(#g-road)' }],
      ['path', { d: 'M11.9 5.6v2.8M11.9 11v2.8M11.9 16.4v2.6', stroke: '#f8fafc', 'stroke-width': '1.8', 'stroke-linecap': 'round' }],
    ],
  },
  car: {
    defs: '<linearGradient id="g-car" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f87171"/><stop offset="1" stop-color="#dc2626"/></linearGradient>',
    nodes: [
      ['path', { d: 'm4.6 13.2 1.6-4.2c.4-1 1.1-1.4 2.1-1.4h7.4c1 0 1.7.4 2.1 1.4l1.6 4.2c1.2.3 2 1 2 2v2.2H2.6v-2.2c0-1 .8-1.7 2-2z', fill: 'url(#g-car)' }],
      ['path', { d: 'M7.4 11.4 8.4 9c.2-.6.6-.8 1.2-.8h4.8c.6 0 1 .2 1.2.8l1 2.4z', fill: '#dbeafe' }],
      ['circle', { cx: '7.6', cy: '17.4', r: '2.1', fill: '#1f2937' }],
      ['circle', { cx: '16.4', cy: '17.4', r: '2.1', fill: '#1f2937' }],
      ['circle', { cx: '7.6', cy: '17.4', r: '0.8', fill: '#e5e7eb' }],
      ['circle', { cx: '16.4', cy: '17.4', r: '0.8', fill: '#e5e7eb' }],
    ],
  },
  truck: {
    defs: '<linearGradient id="g-tr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#2563eb"/></linearGradient>',
    nodes: [
      ['rect', { x: '2.4', y: '7.6', width: '11.4', height: '9', rx: '1.2', fill: 'url(#g-tr)' }],
      ['path', { d: 'M13.8 10.4h3.6l2.9 3.2v3h-6.5z', fill: '#f59e0b' }],
      ['rect', { x: '14.8', y: '11.2', width: '2.6', height: '2.2', rx: '0.4', fill: '#dbeafe' }],
      ['circle', { cx: '6.6', cy: '18', r: '2', fill: '#111827' }],
      ['circle', { cx: '16.6', cy: '18', r: '2', fill: '#111827' }],
      ['circle', { cx: '6.6', cy: '18', r: '0.8', fill: '#d1d5db' }],
      ['circle', { cx: '16.6', cy: '18', r: '0.8', fill: '#d1d5db' }],
    ],
  },

  // ===== Nhóm 4: Đánh dấu & xếp hạng =====
  star: {
    nodes: [['path', { d: 'm12 2.8 2.8 5.9 6.4.8-4.7 4.4 1.2 6.4-5.7-3.2-5.7 3.2 1.2-6.4L2.8 9.5l6.4-.8z', fill: '#eab308', stroke: '#ca8a04', 'stroke-width': '1', 'stroke-linejoin': 'round' }]],
  },
  medal: {
    defs: '<linearGradient id="g-med" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>',
    nodes: [
      ['path', { d: 'M9.6 13 7.2 21.4l4.8-2.6z', fill: '#dc2626' }],
      ['path', { d: 'M14.4 13l2.4 8.4-4.8-2.6z', fill: '#b91c1c' }],
      ['circle', { cx: '12', cy: '9.2', r: '6.4', fill: 'url(#g-med)', stroke: '#b45309', 'stroke-width': '0.8' }],
      ['path', { d: 'm9.8 9.2 1.6 1.6 3-3.4', stroke: '#ffffff', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }],
    ],
  },
  target: {
    nodes: [
      ['circle', { cx: '12', cy: '12', r: '9.2', fill: '#ef4444' }],
      ['circle', { cx: '12', cy: '12', r: '6.2', fill: '#ffffff' }],
      ['circle', { cx: '12', cy: '12', r: '3.4', fill: '#ef4444' }],
      ['circle', { cx: '12', cy: '12', r: '1.1', fill: '#ffffff' }],
    ],
  },
  chartUp: {
    defs: '<linearGradient id="g-ch" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#15803d"/><stop offset="1" stop-color="#4ade80"/></linearGradient>',
    nodes: [
      ['path', { d: 'M3.6 4v15.4a1 1 0 0 0 1 1H20.4', stroke: '#475569', 'stroke-width': '1.6', fill: 'none', 'stroke-linecap': 'round' }],
      ['path', { d: 'm6.4 15.6 3.6-3.8 2.8 2.4 5-6', stroke: 'url(#g-ch)', 'stroke-width': '2.4', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
      ['path', { d: 'M17.8 8.2h-3.1M17.8 8.2v3.1', stroke: '#16a34a', 'stroke-width': '2.4', 'stroke-linecap': 'round' }],
    ],
  },
  shield: {
    defs: '<linearGradient id="g-sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>',
    nodes: [
      ['path', { d: 'M12 2.6 4.8 5.4v5.8c0 4.6 3 8 7.2 10 4.2-2 7.2-5.4 7.2-10V5.4z', fill: 'url(#g-sh)' }],
      ['path', { d: 'm8.6 11.6 2.4 2.4 4.6-5', stroke: '#ffffff', 'stroke-width': '2.2', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ],
  },
  person: {
    defs: '<linearGradient id="g-per" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#2563eb"/></linearGradient>',
    nodes: [
      ['circle', { cx: '12', cy: '7.6', r: '3.7', fill: 'url(#g-per)' }],
      ['path', { d: 'M4.6 20.6c.7-4.3 3.5-6.5 7.4-6.5s6.7 2.2 7.4 6.5z', fill: 'url(#g-per)' }],
    ],
  },
  phone: {
    defs: '<linearGradient id="g-ph" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#15803d"/></linearGradient>',
    nodes: [
      ['path', { d: 'M6.6 3.6c.8 0 1.4.4 1.7 1.1l1 2.3c.3.7.1 1.5-.5 2l-1.2 1c.9 2 2.5 3.6 4.5 4.5l1-1.2c.5-.6 1.3-.8 2-.5l2.3 1c.7.3 1.1 1 1.1 1.7v1.6c0 1.2-1 2.2-2.2 2.1C9.9 18.6 5.4 14 4.5 5.8 4.4 4.6 5.4 3.6 6.6 3.6z', fill: 'url(#g-ph)' }],
    ],
  },

  // ===== Bổ sung: quy trình & phê duyệt =====
  stamp: {
    defs: '<linearGradient id="g-stamp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#4338ca"/></linearGradient>',
    nodes: [
      ['path', { d: 'M10 3.4h4v4.2c1.9.7 3.2 2.3 3.2 4.4v2.6H6.8V12c0-2.1 1.3-3.7 3.2-4.4z', fill: 'url(#g-stamp)' }],
      ['rect', { x: '4.4', y: '14.6', width: '15.2', height: '3', rx: '1.4', fill: '#312e81' }],
      ['rect', { x: '3', y: '18.6', width: '18', height: '2.4', rx: '1.2', fill: '#6366f1' }],
    ],
  },
  handshake: {
    nodes: [
      ['path', { d: 'm2.8 9.4 5-4.2c.6-.5 1.5-.5 2.1 0l2.1 1.9 2.1-1.9c.6-.5 1.5-.5 2.1 0l5 4.2c1 1 1 2.6 0 3.6l-7.4 7c-.7.7-1.9.7-2.6 0l-7.4-7c-1-1-1-2.6 0-3.6z', fill: '#f59e0b', stroke: '#92400e', 'stroke-width': '1', 'stroke-linejoin': 'round' }],
      ['path', { d: 'm8.6 12.4 2 2 4-4.6', stroke: '#ffffff', 'stroke-width': '2', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ],
  },
  scale: {
    nodes: [
      ['rect', { x: '11', y: '2.6', width: '2', height: '15', fill: '#475569' }],
      ['path', { d: 'M4 5.4h16', stroke: '#475569', 'stroke-width': '2', 'stroke-linecap': 'round' }],
      ['path', { d: 'M5 5.4 3 12.4h4z', fill: '#38bdf8' }],
      ['path', { d: 'M19 5.4l2 7H17z', fill: '#38bdf8' }],
      ['rect', { x: '7.4', y: '18.4', width: '9.2', height: '2.4', rx: '1.2', fill: '#475569' }],
    ],
  },
  penSign: {
    nodes: [
      ['path', { d: 'm4 20 1-4L16.6 4.4a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L8 19z', fill: '#0ea5e9' }],
      ['path', { d: 'M14.8 6.2l3.4 3.4', stroke: '#0369a1', 'stroke-width': '1.4' }],
      ['path', { d: 'M3.4 20.6h17.2', stroke: '#475569', 'stroke-width': '2', 'stroke-linecap': 'round' }],
    ],
  },
  folderCheck: {
    defs: '<linearGradient id="g-fck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#d97706"/></linearGradient>',
    nodes: [
      ['path', { d: 'M2.8 6.4a1.6 1.6 0 0 1 1.6-1.6h5l1.8 2.2h8.4a1.6 1.6 0 0 1 1.6 1.6v9.4a1.6 1.6 0 0 1-1.6 1.6H4.4a1.6 1.6 0 0 1-1.6-1.6z', fill: 'url(#g-fck)' }],
      ['path', { d: 'm9.4 12.8 1.8 1.8 3.4-4', stroke: '#ffffff', 'stroke-width': '2', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ],
  },
  calendarCheck: {
    nodes: [
      ['rect', { x: '3.4', y: '4.6', width: '17.2', height: '16', rx: '2.4', fill: '#0ea5e9' }],
      ['rect', { x: '3.4', y: '4.6', width: '17.2', height: '5', rx: '2.4', fill: '#0369a1' }],
      ['path', { d: 'M8 2.6v4M16 2.6v4', stroke: '#e0f2fe', 'stroke-width': '2.2', 'stroke-linecap': 'round' }],
      ['path', { d: 'm9.4 15.4 1.8 1.8 3.4-4', stroke: '#ffffff', 'stroke-width': '2', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ],
  },
  send: {
    nodes: [
      ['path', { d: 'M21 3.6 3.4 10.4l6.4 2.4 2.4 6.4z', fill: '#38bdf8', stroke: '#0369a1', 'stroke-width': '1', 'stroke-linejoin': 'round' }],
      ['path', { d: 'M21 3.6 9.8 12.8', stroke: '#ffffff', 'stroke-width': '1.6' }],
    ],
  },
  megaphone: {
    defs: '<linearGradient id="g-meg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f87171"/><stop offset="1" stop-color="#b91c1c"/></linearGradient>',
    nodes: [
      ['path', { d: 'M3.4 10.4v4.4a1.4 1.4 0 0 0 1.4 1.4h2.4l9.6 4.4a.8.8 0 0 0 1.2-.7V4.5a.8.8 0 0 0-1.2-.7l-9.6 4.4H4.8a1.4 1.4 0 0 0-1.4 1.4z', fill: 'url(#g-meg)' }],
      ['path', { d: 'M20.6 9.4a4 4 0 0 1 0 6', stroke: '#475569', 'stroke-width': '2', fill: 'none', 'stroke-linecap': 'round' }],
    ],
  },

  // ===== Bổ sung: thiết bị & hạ tầng =====
  transformer: {
    defs: '<linearGradient id="g-trf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#94a3b8"/><stop offset="1" stop-color="#475569"/></linearGradient>',
    nodes: [
      ['rect', { x: '4.6', y: '9', width: '14.8', height: '10.4', rx: '1.6', fill: 'url(#g-trf)' }],
      ['path', { d: 'M8.4 9V5.4M12 9V3.6M15.6 9V5.4', stroke: '#1f2937', 'stroke-width': '2', 'stroke-linecap': 'round' }],
      ['circle', { cx: '8.4', cy: '4.2', r: '1.1', fill: '#fbbf24' }],
      ['circle', { cx: '12', cy: '2.6', r: '1.1', fill: '#fbbf24' }],
      ['circle', { cx: '15.6', cy: '4.2', r: '1.1', fill: '#fbbf24' }],
      ['path', { d: 'm12.6 11.4-2.4 4.2h1.7l-.5 2.4 2.6-4.2h-1.7z', fill: '#fde047' }],
    ],
  },
  cabinet: {
    defs: '<linearGradient id="g-cab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cbd5e1"/><stop offset="1" stop-color="#64748b"/></linearGradient>',
    nodes: [
      ['rect', { x: '5.4', y: '2.8', width: '13.2', height: '17.8', rx: '1.6', fill: 'url(#g-cab)', stroke: '#334155', 'stroke-width': '1' }],
      ['rect', { x: '7.4', y: '5', width: '9.2', height: '3.4', rx: '0.8', fill: '#0f172a' }],
      ['circle', { cx: '15.2', cy: '12.4', r: '1', fill: '#1f2937' }],
      ['path', { d: 'M7.4 12v6M9.4 12v6M11.4 12v6', stroke: '#e2e8f0', 'stroke-width': '1.2' }],
    ],
  },
  warehouse: {
    defs: '<linearGradient id="g-wh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#94a3b8"/><stop offset="1" stop-color="#64748b"/></linearGradient>',
    nodes: [
      ['path', { d: 'M2.6 10.2 12 3.4l9.4 6.8v10a1 1 0 0 1-1 1H3.6a1 1 0 0 1-1-1z', fill: 'url(#g-wh)' }],
      ['rect', { x: '9.4', y: '13.4', width: '5.2', height: '7.8', fill: '#1e293b' }],
      ['path', { d: 'M7 10.2v3.4M10 10.2v3.4M14 10.2v3.4M17 10.2v3.4', stroke: '#e2e8f0', 'stroke-width': '1.4' }],
    ],
  },
  bank: {
    defs: '<linearGradient id="g-bank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2e8f0"/><stop offset="1" stop-color="#94a3b8"/></linearGradient>',
    nodes: [
      ['path', { d: 'm12 2.6 9.4 4v1.8H2.6V6.6z', fill: '#475569' }],
      ['rect', { x: '4', y: '10', width: '2.6', height: '7', fill: 'url(#g-bank)' }],
      ['rect', { x: '8.2', y: '10', width: '2.6', height: '7', fill: 'url(#g-bank)' }],
      ['rect', { x: '12.4', y: '10', width: '2.6', height: '7', fill: 'url(#g-bank)' }],
      ['rect', { x: '16.4', y: '10', width: '2.6', height: '7', fill: 'url(#g-bank)' }],
      ['rect', { x: '2.6', y: '17.6', width: '18.8', height: '2.6', rx: '1', fill: '#475569' }],
    ],
  },
  hospital: {
    nodes: [
      ['rect', { x: '4', y: '9', width: '16', height: '11.6', rx: '1.4', fill: '#f8fafc', stroke: '#dc2626', 'stroke-width': '1.4' }],
      ['rect', { x: '10.6', y: '4.6', width: '2.8', height: '8.8', fill: '#dc2626' }],
      ['rect', { x: '7.8', y: '7.4', width: '8.4', height: '2.8', fill: '#dc2626' }],
      ['rect', { x: '10.8', y: '12.4', width: '2.4', height: '4', fill: '#dc2626' }],
    ],
  },
  market: {
    defs: '<linearGradient id="g-mkt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#15803d"/></linearGradient>',
    nodes: [
      ['path', { d: 'M3 9.4a1.4 1.4 0 0 1 1.2-1.4l6-1a1.4 1.4 0 0 1 1.6 1.1l1 4.7H4.2z', fill: 'url(#g-mkt)' }],
      ['path', { d: 'M21 9.4a1.4 1.4 0 0 0-1.2-1.4l-6-1a1.4 1.4 0 0 0-1.6 1.1l-1 4.7h8.6z', fill: '#86efac' }],
      ['path', { d: 'M5 12.8h14l-1.2 7.4H6.2z', fill: '#f1f5f9', stroke: '#15803d', 'stroke-width': '1' }],
    ],
  },

  // ===== Bổ sung: tài liệu & đánh dấu =====
  receipt: {
    nodes: [
      ['path', { d: 'M6 2.8h12a1.2 1.2 0 0 1 1.2 1.2v16.4l-2.4-1.6-2.4 1.6-2.4-1.6-2.4 1.6-2.4-1.6L4.8 20.4V4A1.2 1.2 0 0 1 6 2.8z', fill: '#f8fafc', stroke: '#64748b', 'stroke-width': '1.2' }],
      ['path', { d: 'M8.4 8h7.2M8.4 11.2h7.2M8.4 14.4h4.4', stroke: '#64748b', 'stroke-width': '1.4', 'stroke-linecap': 'round' }],
    ],
  },
  banknote: {
    defs: '<linearGradient id="g-bn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#86efac"/><stop offset="1" stop-color="#16a34a"/></linearGradient>',
    nodes: [
      ['rect', { x: '2.4', y: '7', width: '19.2', height: '10', rx: '1.6', fill: 'url(#g-bn)', stroke: '#14532d', 'stroke-width': '1' }],
      ['circle', { cx: '12', cy: '12', r: '3', fill: 'none', stroke: '#f0fdf4', 'stroke-width': '1.6' }],
      ['circle', { cx: '12', cy: '12', r: '0.9', fill: '#f0fdf4' }],
    ],
  },
  keyRound: {
    nodes: [
      ['circle', { cx: '8', cy: '8', r: '5.2', fill: 'none', stroke: '#d97706', 'stroke-width': '2.6' }],
      ['path', { d: 'm11.8 11.8 7.4 7.4M16.6 16.6l1.8-1.8M14.4 18.8l1.8-1.8', stroke: '#d97706', 'stroke-width': '2.4', 'stroke-linecap': 'round' }],
    ],
  },
  idCard: {
    defs: '<linearGradient id="g-id" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93c5fd"/><stop offset="1" stop-color="#2563eb"/></linearGradient>',
    nodes: [
      ['rect', { x: '2.4', y: '5.4', width: '19.2', height: '13.2', rx: '2', fill: 'url(#g-id)' }],
      ['circle', { cx: '8', cy: '11', r: '2.4', fill: '#eff6ff' }],
      ['path', { d: 'M4.8 16.4c.5-2.4 1.7-3.4 3.2-3.4s2.7 1 3.2 3.4z', fill: '#eff6ff' }],
      ['path', { d: 'M14 9.4h5.6M14 12.4h5.6M14 15.4h3.6', stroke: '#eff6ff', 'stroke-width': '1.6', 'stroke-linecap': 'round' }],
    ],
  },
  gear: {
    nodes: [
      ['path', { d: 'M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z', fill: '#cbd5e1', stroke: '#475569', 'stroke-width': '1.2' }],
      ['path', { d: 'M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8', stroke: '#475569', 'stroke-width': '2.2', 'stroke-linecap': 'round' }],
    ],
  },
  bulb: {
    defs: '<linearGradient id="g-bulb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fde047"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>',
    nodes: [
      ['path', { d: 'M12 2.8a6.4 6.4 0 0 0-3.8 11.6c.7.6 1.2 1.3 1.4 2.2h4.8c.2-.9.7-1.6 1.4-2.2A6.4 6.4 0 0 0 12 2.8z', fill: 'url(#g-bulb)' }],
      ['rect', { x: '9.8', y: '17.4', width: '4.4', height: '1.8', rx: '0.9', fill: '#64748b' }],
      ['rect', { x: '10.4', y: '19.6', width: '3.2', height: '1.8', rx: '0.9', fill: '#64748b' }],
    ],
  },
  bookOpen: {
    defs: '<linearGradient id="g-book" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient>',
    nodes: [
      ['path', { d: 'M12 5.4C10 4 7.4 3.6 3.6 4v13.2c3.8-.4 6.4 0 8.4 1.4 2-1.4 4.6-1.8 8.4-1.4V4c-3.8-.4-6.4 0-8.4 1.4z', fill: 'url(#g-book)' }],
      ['path', { d: 'M12 5.4v13.2', stroke: '#dbeafe', 'stroke-width': '1.4' }],
    ],
  },
  pinCheck: {
    nodes: [
      ['path', { d: 'M12 2a7.2 7.2 0 0 0-7.2 7.2C4.8 15 12 22 12 22s7.2-7 7.2-12.8A7.2 7.2 0 0 0 12 2z', fill: '#16a34a' }],
      ['path', { d: 'm9.3 9.2 1.9 1.9 3.6-4.2', stroke: '#ffffff', 'stroke-width': '2', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ],
  },
  flagCheck: {
    nodes: [
      ['path', { d: 'M6 21.5V3.6', stroke: '#475569', 'stroke-width': '2.4', 'stroke-linecap': 'round' }],
      ['path', { d: 'M6.6 4.4c3.2-2.1 6.4 1.7 12.4-.5v8.5c-6 2.2-9.2-1.6-12.4.5z', fill: '#16a34a' }],
      ['path', { d: 'm9.4 8.4 1.5 1.5 2.8-3.2', stroke: '#ffffff', 'stroke-width': '1.5', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
    ],
  },
  truckCheck: {
    defs: '<linearGradient id="g-trc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#15803d"/></linearGradient>',
    nodes: [
      ['rect', { x: '2.4', y: '7.6', width: '11.4', height: '9', rx: '1.2', fill: 'url(#g-trc)' }],
      ['path', { d: 'M13.8 10.4h3.6l2.9 3.2v3h-6.5z', fill: '#86efac' }],
      ['path', { d: 'm5.4 12.4 1.6 1.6 3-3.6', stroke: '#ffffff', 'stroke-width': '1.8', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }],
      ['circle', { cx: '6.6', cy: '18', r: '2', fill: '#111827' }],
      ['circle', { cx: '16.6', cy: '18', r: '2', fill: '#111827' }],
    ],
  },
};

const GROUPS = [
  { title: 'Trạm & năng lượng', ids: ['bolt', 'plug', 'battery', 'batteryLow', 'evStation', 'solar', 'meter', 'transformer', 'cabinet'] },
  { title: 'Trạng thái & quy trình', ids: ['flag', 'flagCheck', 'wrench', 'clock', 'hourglass', 'search', 'eye', 'clipboard', 'folderCheck', 'document', 'check', 'pinCheck', 'cross', 'alert', 'info', 'play', 'pause', 'stop', 'ban', 'lock', 'bell', 'stamp', 'handshake', 'scale', 'penSign', 'calendarCheck', 'send', 'megaphone'] },
  { title: 'Địa điểm & hạ tầng', ids: ['pin', 'home', 'building', 'factory', 'warehouse', 'bank', 'hospital', 'market', 'store', 'parkingP', 'cone', 'road', 'car', 'truck', 'truckCheck'] },
  { title: 'Đánh dấu & xếp hạng', ids: ['star', 'medal', 'target', 'chartUp', 'shield', 'person', 'phone', 'receipt', 'banknote', 'keyRound', 'idCard', 'gear', 'bulb', 'bookOpen'] },
];

const ICON_LABELS = {
  bolt: 'Sạc',
  plug: 'Phích cắm',
  battery: 'Pin',
  batteryLow: 'Pin yếu',
  evStation: 'Trạm sạc',
  solar: 'Điện mặt trời',
  meter: 'Công tơ',
  transformer: 'Máy biến áp',
  cabinet: 'Tủ điện',
  flag: 'Quy hoạch',
  wrench: 'Thi công',
  clock: 'Chờ',
  hourglass: 'Đang xử lý',
  search: 'Xem xét',
  eye: 'Theo dõi',
  clipboard: 'Hồ sơ',
  document: 'Tài liệu',
  check: 'Đã duyệt',
  cross: 'Từ chối',
  alert: 'Cảnh báo',
  info: 'Thông tin',
  play: 'Chạy lại',
  pause: 'Tạm dừng',
  stop: 'Dừng',
  ban: 'Cấm',
  lock: 'Khóa',
  bell: 'Thông báo',
  stamp: 'Duyệt chủ trương',
  handshake: 'Liên kết',
  scale: 'Cân đối',
  penSign: 'Ký duyệt',
  folderCheck: 'Hồ sơ duyệt',
  calendarCheck: 'Lịch duyệt',
  send: 'Gửi đi',
  megaphone: 'Thông báo chung',
  pin: 'Định vị',
  home: 'Nhà',
  building: 'Tòa nhà',
  factory: 'Nhà máy',
  store: 'Cửa hàng',
  parkingP: 'Bãi xe',
  cone: 'Chướng ngại',
  road: 'Đường',
  car: 'Ô tô',
  truck: 'Vận chuyển',
  truckCheck: 'Vận chuyển xong',
  warehouse: 'Kho',
  bank: 'Ngân hàng',
  hospital: 'Bệnh viện',
  market: 'Chợ',
  star: 'Ưu tiên',
  medal: 'Xuất sắc',
  target: 'Mục tiêu',
  chartUp: 'Tăng trưởng',
  shield: 'An toàn',
  person: 'Nhân sự',
  phone: 'Liên hệ',
  receipt: 'Biên nhận',
  banknote: 'Tiền',
  keyRound: 'Khóa tròn',
  idCard: 'Thẻ ID',
  gear: 'Cài đặt',
  bulb: 'Ý tưởng',
  bookOpen: 'Sách',
  pinCheck: 'Đã định vị',
  flagCheck: 'Cờ duyệt',
};

export const MARKER_ICONS = Object.keys(ICONS).map((id) => ({ id, label: ICON_LABELS[id] }));

export const MARKER_ICON_GROUPS = GROUPS.map((g) => ({ title: g.title, icons: g.ids.map((id) => ({ id, label: ICON_LABELS[id] })) }));

export const isValidMarkerIcon = (id) => !!id && id !== 'none' && !!ICONS[id];

export const iconSvgMarkup = (id, { size = 16 } = {}) => {
  if (!isValidMarkerIcon(id)) return '';
  const icon = ICONS[id];
  const defs = icon.defs ? `<defs>${icon.defs}</defs>` : '';
  const inner = icon.nodes.map(([tag, a]) => {
    const attrs = Object.entries(a).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${attrs}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" style="display:block">${defs}${inner}</svg>`;
};

export const STATUS_ICON_DEFAULTS = {
  station: { PLANNING: 'flag', ACTIVE: 'evStation', DEPLOYING: 'wrench', REJECTED: 'ban' },
  proposal: { PENDING: 'clock', REVIEWING: 'search', APPROVED: 'check', REJECTED: 'cross', CANCELLED: 'ban', CONTRACT_SIGNED: 'document', CONTRACT_FAILED: 'alert' },
};

const ENTITY_TO_MAP = { stations: 'station', station_proposals: 'proposal' };

let configCache = null;
let loadPromise = null;
let statusOptionsCache = { station: null, proposal: null };

const parseOptions = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
};

const extractOverrides = (defs) => {
  const out = { station: {}, proposal: {} };
  (defs || []).forEach((fd) => {
    if (!fd || fd.key !== 'status' || !ENTITY_TO_MAP[fd.entity]) return;
    parseOptions(fd.options).forEach((opt) => {
      if (!opt || typeof opt !== 'object' || opt.value == null) return;
      if (opt.icon === 'none') { out[ENTITY_TO_MAP[fd.entity]][opt.value] = ''; return; }
      if (isValidMarkerIcon(opt.icon)) out[ENTITY_TO_MAP[fd.entity]][opt.value] = opt.icon;
    });
  });
  return out;
};

const extractStatusOptions = (defs) => {
  const out = { station: [], proposal: [] };
  (defs || []).forEach((fd) => {
    if (!fd || fd.key !== 'status' || !ENTITY_TO_MAP[fd.entity]) return;
    parseOptions(fd.options).forEach((opt) => {
      if (!opt || typeof opt !== 'object' || opt.value == null) return;
      out[ENTITY_TO_MAP[fd.entity]].push({
        value: opt.value,
        label: opt.label || opt.value,
        color: opt.color || '',
        show_in_legend: opt.show_in_legend === 0 || opt.show_in_legend === false ? false : true,
        sort_order: Number(opt.sort_order) || 999
      });
    });
  });
  return out;
};

export const loadMarkerIconConfig = (force = false) => {
  if (!force && configCache) return Promise.resolve(configCache);
  if (loadPromise) return loadPromise;
  loadPromise = Promise.all([
    fieldDefinitionService.getByEntity('stations'),
    fieldDefinitionService.getByEntity('station_proposals'),
  ]).then((resList) => {
    const overrides = { station: {}, proposal: {} };
    const statusOpts = { station: [], proposal: [] };
    resList.forEach((res) => {
      if (res && res.success) {
        const part = extractOverrides(res.data);
        Object.assign(overrides.station, part.station || {});
        Object.assign(overrides.proposal, part.proposal || {});
        const sopts = extractStatusOptions(res.data);
        if (sopts.station.length > 0) statusOpts.station = sopts.station;
        if (sopts.proposal.length > 0) statusOpts.proposal = sopts.proposal;
      }
    });
    if (statusOpts.station.length > 0) statusOptionsCache.station = statusOpts.station;
    if (statusOpts.proposal.length > 0) statusOptionsCache.proposal = statusOpts.proposal;
    configCache = {
      station: { ...STATUS_ICON_DEFAULTS.station, ...overrides.station },
      proposal: { ...STATUS_ICON_DEFAULTS.proposal, ...overrides.proposal },
    };
    return configCache;
  }).finally(() => { loadPromise = null; });
  return loadPromise;
};

export const getMarkerIcon = (status, entity) => {
  const map = configCache && configCache[entity === 'station' ? 'station' : 'proposal'];
  if (map && Object.prototype.hasOwnProperty.call(map, status)) return map[status];
  const defaults = STATUS_ICON_DEFAULTS[entity === 'station' ? 'station' : 'proposal'];
  return defaults[status] || '';
};

export const getStatusOptions = (entity) => {
  const key = entity === 'station' ? 'station' : 'proposal';
  return statusOptionsCache[key] || null;
};

export const MARKER_ICONS_REFRESH_EVENT = 'markericons:refresh';

export const notifyMarkerIconsChanged = () => {
  configCache = null;
  loadPromise = null;
  statusOptionsCache = { station: null, proposal: null };
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MARKER_ICONS_REFRESH_EVENT));
};
