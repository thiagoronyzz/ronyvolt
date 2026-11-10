import React, { useEffect, useState } from 'react';

interface Props {
  /** Changing this value replays the transition (e.g. 'garage' → 'race'). */
  screenKey: string;
  /** Presentation label shown while the veil is opaque. */
  label: string;
  /** Keep the veil up (e.g. the circuit is still being built). */
  hold?: boolean;
}

/**
 * SCREEN VEIL — the transition between garage, race and results.
 *
 * Full-screen black layer that fades in, changes screen underneath at the
 * midpoint and fades out, so the 3D scene never pops. It is pointer-events:
 * none and ends at opacity 0, so it can never block a click or leave a dark
 * rectangle on the canvas (that was the risk with the previous one-shot fade).
 * Respects prefers-reduced-motion by skipping the animation entirely.
 */
export const ScreenVeil: React.FC<Props> = ({ screenKey, label, hold = false }) => {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    setVisible(true);
    setFading(false);
    if (hold) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setVisible(false);
      return;
    }
    const t1 = window.setTimeout(() => setFading(true), 140);
    const t2 = window.setTimeout(() => setVisible(false), 620);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey, hold]);

  if (!visible) return null;
  return (
    <div
      className={`vu-veil${fading ? ' is-fading' : ''}`}
      aria-hidden
      data-screen={screenKey}
    >
      <div className="vu-veil-mark">
        <span className="vu-veil-bar" />
        <span className="vu-veil-label">{label}</span>
      </div>
    </div>
  );
};
