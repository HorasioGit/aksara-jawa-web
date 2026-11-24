// Gunungan (kayon) bergaya, digambar sendiri dengan SVG.
// Siluet daun meruncing, pohon hayat di tengah, gapura di bawah,
// dan titik-titik "tatahan" seperti pahatan kulit wayang.

const OUTER =
  'M150 14 C172 58 246 128 266 226 C280 300 244 360 206 398 L94 398 C56 360 20 300 34 226 C54 128 128 58 150 14 Z';

function branchPair(y: number, spread: number, lift: number, key: number) {
  const r = 5 + spread / 22;
  const L = `M150 ${y} C${150 - spread * 0.35} ${y - lift * 0.2} ${150 - spread * 0.8} ${y - lift} ${150 - spread} ${y - lift * 0.55}`;
  const R = `M150 ${y} C${150 + spread * 0.35} ${y - lift * 0.2} ${150 + spread * 0.8} ${y - lift} ${150 + spread} ${y - lift * 0.55}`;
  return (
    <g key={key}>
      <path d={L} />
      <path d={R} />
      <circle cx={150 - spread} cy={y - lift * 0.55 + r} r={r} className="g-curl" />
      <circle cx={150 + spread} cy={y - lift * 0.55 + r} r={r} className="g-curl" />
      <ellipse cx={150 - spread * 0.55} cy={y - lift * 0.78} rx={4} ry={7} className="g-leaf" transform={`rotate(-35 ${150 - spread * 0.55} ${y - lift * 0.78})`} />
      <ellipse cx={150 + spread * 0.55} cy={y - lift * 0.78} rx={4} ry={7} className="g-leaf" transform={`rotate(35 ${150 + spread * 0.55} ${y - lift * 0.78})`} />
    </g>
  );
}

export default function Gunungan({ className }: { className?: string }) {
  const branches = [
    [300, 92, 40],
    [258, 86, 38],
    [216, 74, 36],
    [176, 58, 32],
    [138, 40, 26],
    [104, 24, 20],
  ];
  return (
    <svg viewBox="0 0 300 440" className={className} role="img" aria-label="Gunungan wayang kulit">
      <defs>
        <radialGradient id="blencong" cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor="#E3A93B" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#E3A93B" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#E3A93B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="kulit" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8E2F22" />
          <stop offset="60%" stopColor="#5E2A1C" />
          <stop offset="100%" stopColor="#3B1E17" />
        </linearGradient>
        <clipPath id="g-clip"><path d={OUTER} /></clipPath>
      </defs>

      <ellipse cx="150" cy="200" rx="150" ry="200" fill="url(#blencong)" />

      <path d={OUTER} fill="url(#kulit)" />
      <g clipPath="url(#g-clip)">
        {/* sisik berlapis di bagian atas */}
        {Array.from({ length: 7 }).map((_, i) => (
          <path
            key={i}
            d={`M${60 - i * 4} ${70 + i * 26} Q150 ${30 + i * 26} ${240 + i * 4} ${70 + i * 26}`}
            className="g-scale"
          />
        ))}
      </g>

      {/* tatahan: titik pahatan mengikuti tepi */}
      <path d={OUTER} className="g-dots" transform="translate(150 206) scale(0.9) translate(-150 -206)" />
      <path d={OUTER} className="g-edge" />

      {/* pohon hayat */}
      <g className="g-tree">
        <path d="M150 334 L150 70" />
        {branches.map(([y, s, l], i) => branchPair(y, s, l, i))}
      </g>

      {/* api di puncak */}
      <path d="M150 6 C156 20 160 28 150 40 C140 28 144 20 150 6 Z" className="g-flame" />

      {/* gapura */}
      <g className="g-gate">
        <path d="M108 398 L108 344 L118 344 L118 336 L182 336 L182 344 L192 344 L192 398 Z" />
        <path d="M116 336 L130 318 L170 318 L184 336 Z" />
        <path d="M137 398 L137 366 Q150 350 163 366 L163 398 Z" className="g-door" />
      </g>
      <rect x="86" y="398" width="128" height="10" rx="2" className="g-base" />
      <path d="M150 408 L150 436" className="g-stick" />
    </svg>
  );
}
