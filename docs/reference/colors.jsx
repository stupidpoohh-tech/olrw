// ============================================
// Shared color palettes — calm vintage
//   PAPER_COLORS : telegram paper tints (per-member, distinguishes sender)
//   TYPE_COLORS  : typewriter body tints (per-member-per-box, distinguishes box)
// The typewriter photo is a saturated seafoam-green Olivetti on a near-white
// ground, so hue-rotate/saturate recolors the body while leaving the ground
// and gray keys neutral. `filter` is applied to the <img>; `tint` is the
// accent hex used for dots / glows in the UI.
// ============================================

window.PAPER_COLORS = [
  { id: 'ivory',  label: '아이보리', bg: '#faf5ea', edge: '#eadfc8', ink: '#4b4335' },
  { id: 'blush',  label: '블러시',   bg: '#f8eee9', edge: '#ecd7cd', ink: '#5a453d' },
  { id: 'sage',   label: '세이지',   bg: '#eef1e6', edge: '#d6ddc7', ink: '#414a38' },
  { id: 'powder', label: '파우더',   bg: '#eaf0f2', edge: '#d1dfe3', ink: '#3a4750' },
  { id: 'lilac',  label: '라일락',   bg: '#f0ecf3', edge: '#dcd2e4', ink: '#463f52' },
  { id: 'wheat',  label: '밀짚',     bg: '#f6efdb', edge: '#e6d8b8', ink: '#4e442e' },
  { id: 'clay',   label: '클레이',   bg: '#f6ebe0', edge: '#e6d3c1', ink: '#544435' },
  { id: 'mist',   label: '미스트',   bg: '#e9f1ec', edge: '#cee0d6', ink: '#374a41' },
];

// The base photo is a seafoam-green typewriter. We first knock the saturation
// down so the recolor reads as a soft muted vintage tone, then hue-rotate.
// All tones are deliberately desaturated + slightly warmed for an old-print feel.
window.TYPE_COLORS = [
  { id: 'green',    label: '세이지',   tint: '#8a9d8a', filter: 'saturate(0.62) brightness(1.02)' },
  { id: 'teal',     label: '틸',      tint: '#6f9296', filter: 'hue-rotate(18deg) saturate(0.6) brightness(1.01)' },
  { id: 'blue',     label: '블루그레이', tint: '#7286a0', filter: 'hue-rotate(48deg) saturate(0.5) brightness(1.0)' },
  { id: 'plum',     label: '플럼',     tint: '#8b7793', filter: 'hue-rotate(102deg) saturate(0.42) brightness(1.0)' },
  { id: 'rose',     label: '더스티로즈', tint: '#a8807f', filter: 'hue-rotate(150deg) saturate(0.5) brightness(1.02)' },
  { id: 'terra',    label: '테라코타', tint: '#ab7d63', filter: 'hue-rotate(178deg) saturate(0.55) brightness(1.03)' },
  { id: 'ochre',    label: '오커',     tint: '#a9925f', filter: 'hue-rotate(205deg) saturate(0.55) brightness(1.05)' },
  { id: 'stone',    label: '스톤',     tint: '#8d8a83', filter: 'saturate(0.1) brightness(1.02)' },
];

window.getPaper = (id) => window.PAPER_COLORS.find((p) => p.id === id) || window.PAPER_COLORS[0];
window.getType  = (id) => window.TYPE_COLORS.find((t) => t.id === id) || window.TYPE_COLORS[0];

// Auto-pick the next unused paper color for a new member (falls back to cycling)
window.pickPaper = (usedIds = []) => {
  const free = window.PAPER_COLORS.find((p) => !usedIds.includes(p.id));
  return (free || window.PAPER_COLORS[usedIds.length % window.PAPER_COLORS.length]).id;
};
window.pickType = (usedIds = []) => {
  const free = window.TYPE_COLORS.find((t) => !usedIds.includes(t.id));
  return (free || window.TYPE_COLORS[usedIds.length % window.TYPE_COLORS.length]).id;
};
