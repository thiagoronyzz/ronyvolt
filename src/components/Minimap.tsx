import React, { useMemo } from 'react';

export interface MinimapBlip {
  x: number;
  z: number;
  kind: 'rival' | 'police' | 'sheep';
  color?: string;
}

interface Props {
  /** Track centreline samples in world space (x/z used). */
  points: { x: number; z: number }[];
  /** Opponent positions. */
  blips?: MinimapBlip[];
  /** Player position and heading (radians, 0 = +Z). */
  player: { x: number; z: number; heading: number };
  /** Normalised progress 0..1 around the lap. */
  progress: number;
}

/**
 * MINIMAP — top-down track outline with live positions.
 *
 * The track is normalised into a 100×100 viewBox with a small margin, so the
 * shape is legible at any size and never depends on the world scale. The
 * container is sized entirely by CSS (`.hud-map`), which keeps it inside the
 * safe area on phones and out of the tachometer's corner.
 */
export const Minimap: React.FC<Props> = ({ points, blips = [], player, progress }) => {
  const shape = useMemo(() => {
    if (points.length < 2) return null;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const span = Math.max(maxX - minX, maxZ - minZ) || 1;
    const margin = 8;
    const scale = (100 - margin * 2) / span;
    const offX = margin + ((100 - margin * 2) - (maxX - minX) * scale) / 2;
    const offZ = margin + ((100 - margin * 2) - (maxZ - minZ) * scale) / 2;
    const toLocal = (x: number, z: number) => ({
      x: offX + (x - minX) * scale,
      y: offZ + (z - minZ) * scale,
    });
    const path = points
      .map((p, i) => {
        const l = toLocal(p.x, p.z);
        return `${i === 0 ? 'M' : 'L'}${l.x.toFixed(2)},${l.y.toFixed(2)}`;
      })
      .join(' ');
    return { path, toLocal };
  }, [points]);

  if (!shape) return null;

  const playerPt = shape.toLocal(player.x, player.z);
  // Compass: the world is drawn with +Z downward, so a heading of 0 (facing +Z)
  // points down the map. Convert to a rotation for the little arrow.
  const headingDeg = (player.heading * 180) / Math.PI;

  return (
    <div className="hud-map" aria-hidden>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <defs>
          <linearGradient id="mapLine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.22)" />
          </linearGradient>
        </defs>
        <path d={shape.path} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={6.5} strokeLinejoin="round" />
        <path d={shape.path} fill="none" stroke="url(#mapLine)" strokeWidth={3.2} strokeLinejoin="round" />
        {/* Start/finish tick */}
        <circle cx={shape.toLocal(points[0].x, points[0].z).x} cy={shape.toLocal(points[0].x, points[0].z).y} r={2.6} fill="#fff" />

        {blips.map((b, i) => {
          const l = shape.toLocal(b.x, b.z);
          return (
            <circle
              key={i}
              cx={l.x}
              cy={l.y}
              r={b.kind === 'police' ? 2.2 : 1.9}
              fill={b.color ?? (b.kind === 'police' ? '#38bdf8' : b.kind === 'sheep' ? '#e2e8f0' : '#ef4444')}
              opacity={0.95}
            />
          );
        })}

        {/* Player arrow */}
        <g transform={`translate(${playerPt.x} ${playerPt.y}) rotate(${headingDeg})`}>
          <path d="M0,-4.6 L3.2,3.4 L0,1.9 L-3.2,3.4 Z" fill="#ff9500" stroke="#05070c" strokeWidth={0.8} />
        </g>
      </svg>
      <div className="hud-map-progress">{Math.round(progress * 100)}%</div>
    </div>
  );
};
