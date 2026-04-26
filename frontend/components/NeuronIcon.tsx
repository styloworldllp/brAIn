export function NeuronIcon({ size = 16, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 22 22"
      width={size}
      height={size}
      style={{ flexShrink: 0, ...style }}
    >
      {/* Dendrites */}
      <line x1="7" y1="7" x2="2"   y2="2"   stroke="#f9a8d4" strokeWidth="2"   strokeLinecap="round"/>
      <line x1="7" y1="7" x2="1.5" y2="8"   stroke="#f9a8d4" strokeWidth="1.7" strokeLinecap="round"/>
      <line x1="7" y1="7" x2="5"   y2="1"   stroke="#f9a8d4" strokeWidth="1.7" strokeLinecap="round"/>
      <line x1="7" y1="7" x2="10"  y2="1"   stroke="#f9a8d4" strokeWidth="1.7" strokeLinecap="round"/>
      <line x1="7" y1="7" x2="13"  y2="4"   stroke="#f9a8d4" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Soma (cell body) */}
      <circle cx="7" cy="7" r="4"   fill="#f9a8d4"/>
      <circle cx="7" cy="7" r="2.2" fill="#c084a8"/>
      <circle cx="7" cy="7" r="0.9" fill="#f9a8d4"/>
      {/* Axon beads */}
      <circle cx="10.5" cy="11"   r="1.6" fill="#d97706"/>
      <circle cx="13.5" cy="14"   r="1.6" fill="#d97706"/>
      <circle cx="16.5" cy="17"   r="1.6" fill="#d97706"/>
      <circle cx="19"   cy="19.5" r="1.4" fill="#b45309"/>
      {/* Terminal branches */}
      <line x1="19" y1="19.5" x2="21.5" y2="21.5" stroke="#86efac" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="19" y1="19.5" x2="21"   y2="17.5"  stroke="#86efac" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="19" y1="19.5" x2="21.5" y2="19.2"  stroke="#86efac" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
