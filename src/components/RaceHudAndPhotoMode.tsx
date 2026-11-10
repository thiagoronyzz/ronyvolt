import React, { useEffect, useState } from 'react';
import { Camera, ChartNoAxesCombined, Eye, Gamepad2, Home, Pause, Play, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { CameraView, GameMode, LiveTelemetryFrame, RadioMessage } from '../types/game';
import { audioEngine, RADIO_STATIONS } from '../audio/VelocityAudioEngine';
import { customMusicPlayer, CustomPlayerState } from '../audio/CustomMusicPlayer';
import { Minimap } from './Minimap';

export type CinemaLut = 'natural' | 'kodak_portra' | 'fuji_velvia' | 'teal_orange' | 'noir_1940';

export const LUT_CSS_FILTERS: Record<CinemaLut, string> = {
  natural: 'none',
  kodak_portra: 'contrast(1.06) saturate(1.18) sepia(0.14) brightness(1.03)',
  fuji_velvia: 'contrast(1.22) saturate(1.48)',
  teal_orange: 'contrast(1.16) saturate(1.25) hue-rotate(-8deg)',
  noir_1940: 'grayscale(1) contrast(1.38) brightness(0.96)',
};

interface HudProps {
  frame: LiveTelemetryFrame;
  mode: GameMode;
  totalLaps: number;
  cameraView: CameraView;
  immersiveNoHud: boolean;
  psxRetro: boolean;
  radioFeed: RadioMessage[];
  onCycleCamera: () => void;
  onToggleTelemetry: () => void;
  onTogglePhotoMode: () => void;
  onToggleImmersiveHud: () => void;
  onTogglePsxRetro: () => void;
  onBackToGarage: () => void;
  onTogglePause: () => void;
  onHorn: () => void;
  minimap: {
    points: { x: number; z: number }[];
    player: { x: number; z: number; heading: number };
    progress: number;
    blips: { x: number; z: number; kind: 'rival' | 'police' }[];
  } | null;
  onTouchInput: (partial: {
    throttle?: number;
    brake?: number;
    steer?: number;
    nitro?: boolean;
    handbrake?: boolean;
  }) => void;
}

export const RaceHud: React.FC<HudProps> = ({
  frame,
  mode,
  totalLaps,
  cameraView,
  immersiveNoHud,
  psxRetro,
  radioFeed,
  onCycleCamera,
  onToggleTelemetry,
  onTogglePhotoMode,
  onToggleImmersiveHud,
  onTogglePsxRetro,
  onBackToGarage,
  onTogglePause,
  onHorn,
  minimap,
  onTouchInput,
}) => {
  const [stationId, setStationId] = useState(audioEngine.getStation());

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = (sec % 60).toFixed(2).padStart(5, '0');
    return `${mins}:${rem}`;
  };

  if (immersiveNoHud) {
    return (
      <button
        onClick={onToggleImmersiveHud}
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 30,
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        👁️ Mostrar HUD
      </button>
    );
  }

  const rpmPct = Math.min(100, (frame.rpm / Math.max(1000, frame.maxRpm)) * 100);

  return (
    <>
      {/* Top Race Action Bar */}
      <div className="hud-topbar">
        {/* Position, Lap & Timers */}
        <div className="hud-cluster">
          <div>
            <div className="hud-stat-label">Posição</div>
            <div className="hud-stat-value" style={{ color: '#ffbe0b' }}>
              P{frame.position}
              <span style={{ fontSize: 13, color: '#cbd5e1' }}>/{frame.totalRacers}</span>
            </div>
          </div>

          <div>
            <div className="hud-stat-label">Volta</div>
            <div className="hud-stat-value">
              {frame.lap}/{mode === 'time_trial' ? '∞' : totalLaps}
            </div>
          </div>

          <div>
            <div className="hud-stat-label">Cronômetro</div>
            <div className="hud-stat-value" style={{ color: '#00f5d4', fontFamily: 'var(--vu-mono)' }}>
              {formatTime(frame.lapTimeSec)}
            </div>
          </div>

          {frame.bestLapSec !== null && (
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>MELHOR / DELTA</div>
              <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace' }}>
                {formatTime(frame.bestLapSec)}{' '}
                <span style={{ color: frame.deltaBestSec <= 0 ? '#06d6a0' : '#ef233c' }}>
                  ({frame.deltaBestSec >= 0 ? '+' : ''}
                  {frame.deltaBestSec.toFixed(2)}s)
                </span>
              </div>
            </div>
          )}

          {mode === 'drift' && (
            <div style={{ paddingLeft: 8, borderLeft: '1px solid #334155' }}>
              <div style={{ fontSize: 10, color: '#ff9500' }}>DRIFT {frame.driftCombo}X</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#ffbe0b' }}>
                {frame.driftScore.toLocaleString('pt-BR')} pts
              </div>
            </div>
          )}

          {mode === 'stunt' && (
            <div style={{ paddingLeft: 8, borderLeft: '1px solid #334155' }}>
              <div style={{ fontSize: 10, color: '#00bbf9' }}>ACROBACIAS</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#00f5d4' }}>
                {frame.stuntScore.toLocaleString('pt-BR')} pts
              </div>
            </div>
          )}

          {mode === 'police_chase' && (
            <div style={{ paddingLeft: 8, borderLeft: '1px solid #334155' }}>
              <div style={{ fontSize: 10, color: '#ef233c' }}>PROCURADO</div>
              <div style={{ fontSize: 16 }}>{'⭐'.repeat(frame.wantedStars)}</div>
            </div>
          )}

          {mode === 'delivery' && (
            <div style={{ paddingLeft: 8, borderLeft: '1px solid #334155' }}>
              <div style={{ fontSize: 10, color: '#06d6a0' }}>ENTREGAS: {frame.deliveriesCompleted}</div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Carga: {Math.round(frame.packageIntegrityPct)}%</div>
            </div>
          )}
        </div>

        {/* Top-Right Quick Controls */}
        <div className="hud-actions">
          <select
            value={stationId}
            onChange={(e) => {
              setStationId(e.target.value);
              audioEngine.setStation(e.target.value);
            }}
            style={hudBtn}
          >
            {RADIO_STATIONS.map((rs) => (
              <option key={rs.id} value={rs.id}>
                📻 {rs.name}
              </option>
            ))}
          </select>

          <button onClick={onTogglePause} style={hudBtn} title="Pausar (Esc)">
            <Pause size={13} /> PAUSAR
          </button>
          <button onClick={onHorn} style={hudBtn} title="Buzina (H)">
            <Volume2 size={13} /> BUZINA
          </button>
          <button onClick={onCycleCamera} style={hudBtn}>
            <Camera size={13} /> {cameraView.toUpperCase()} [C]
          </button>
          <button onClick={onToggleTelemetry} style={hudBtn}>
            <ChartNoAxesCombined size={13} /> TELEMETRIA
          </button>
          <button onClick={onTogglePhotoMode} style={hudBtn}>
            <Gamepad2 size={13} /> MODO FOTO
          </button>
          <button
            onClick={onTogglePsxRetro}
            style={{
              ...hudBtn,
              borderColor: psxRetro ? '#ffbe0b' : 'rgba(255,255,255,0.2)',
              color: psxRetro ? '#ffbe0b' : '#fff',
            }}
          >
            👾 {psxRetro ? 'PSX 1999 ON' : 'FILTRO PSX'}
          </button>
          <button onClick={onToggleImmersiveHud} style={hudBtn}>
            <Eye size={13} /> IMERSIVO
          </button>
          <button
            onClick={onBackToGarage}
            style={{ ...hudBtn, background: 'rgba(239, 35, 60, 0.85)', borderColor: '#ef233c' }}
          >
            <Home size={13} /> GARAGEM
          </button>
        </div>
      </div>

      {/* Re-Volt Active Power-Up Indicator */}
      {frame.activePowerup && (
        <div
          style={{
            position: 'fixed',
            top: 84,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'linear-gradient(90deg, #ffbe0b, #fb5607)',
            color: '#080c14',
            padding: '8px 18px',
            borderRadius: 999,
            fontWeight: 900,
            fontSize: 13,
            zIndex: 26,
            boxShadow: '0 0 24px rgba(255,190,11,0.6)',
          }}
        >
          ⚡ POWER-UP RE-VOLT PRONTO: {frame.activePowerup.toUpperCase()} — APERTE [E] PARA DISPARAR!
        </div>
      )}

      {/* Windshield Crack SVG Overlay when FEA Frontal Impact occurs! */}
      {cameraView === 'cockpit' && frame.damage.windshieldCracks.length > 0 && (
        <svg
          style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 18 }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {frame.damage.windshieldCracks.map((cr, idx) => (
            <g key={idx} stroke="rgba(255,255,255,0.65)" strokeWidth={0.18}>
              <line x1={cr.u * 100} y1={cr.v * 100} x2={cr.u * 100 - 12} y2={cr.v * 100 - 9} />
              <line x1={cr.u * 100} y1={cr.v * 100} x2={cr.u * 100 + 14} y2={cr.v * 100 - 6} />
              <line x1={cr.u * 100} y1={cr.v * 100} x2={cr.u * 100 + 5} y2={cr.v * 100 + 13} />
              <line x1={cr.u * 100} y1={cr.v * 100} x2={cr.u * 100 - 9} y2={cr.v * 100 + 11} />
            </g>
          ))}
        </svg>
      )}

      {/* Start lights: red while the car is held on the grid */}
      {frame.lap === 1 && frame.speedKmh < 1 && frame.lapTimeSec < 0.5 && (
        <div className="hud-startlights" aria-hidden>
          <span className="on" />
          <span className="on" />
          <span className="on" />
        </div>
      )}

      {/* Track map (top-left, under the position cluster) */}
      {minimap && !immersiveNoHud && (
        <Minimap points={minimap.points} player={minimap.player} progress={minimap.progress} blips={minimap.blips} />
      )}

      {/* Localized Voice Radio Chatter Feed (Left-Bottom) */}
      <div className="hud-radio">
        {radioFeed.slice(-3).map((msg) => (
          <div
            key={msg.id}
            style={{
              background: 'rgba(8, 13, 25, 0.85)',
              backdropFilter: 'blur(8px)',
              borderLeft:
                msg.relation === 'rival'
                  ? '4px solid #ef233c'
                  : msg.relation === 'ally'
                  ? '4px solid #06d6a0'
                  : '4px solid #38bdf8',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 12,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, color: '#ffbe0b' }}>
              📻 [{msg.callsign}] {msg.senderName} ({msg.nationality}){' '}
              {msg.relation === 'rival' ? '• 😡 RIVAL' : msg.relation === 'ally' ? '• 🤝 ALIADO' : ''}
            </div>
            <div style={{ color: '#f1f5f9', marginTop: 2 }}>“{msg.text}”</div>
          </div>
        ))}

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
          Controles: [W/S ou ↑/↓] Acelerar/Frear • [A/D ou ←/→] Volante • [Espaço] Freio de Mão/Drift • [Shift] Nitro • [E/Q] Marchas/Power-up • [R] Reposicionar
        </div>
      </div>

      {/* Touch / On-Screen Pedals for Mobile & Tablet */}
      <div className="hud-pedals">
        <button
          onPointerDown={() => onTouchInput({ steer: -1 })}
          onPointerUp={() => onTouchInput({ steer: 0 })}
          style={pedalBtn}
        >
          ◀
        </button>
        <button
          onPointerDown={() => onTouchInput({ steer: 1 })}
          onPointerUp={() => onTouchInput({ steer: 0 })}
          style={pedalBtn}
        >
          ▶
        </button>
        <button
          onPointerDown={() => onTouchInput({ brake: 1 })}
          onPointerUp={() => onTouchInput({ brake: 0 })}
          style={{ ...pedalBtn, borderColor: '#ef233c' }}
        >
          FREIO
        </button>
        <button
          onPointerDown={() => onTouchInput({ throttle: 1 })}
          onPointerUp={() => onTouchInput({ throttle: 0 })}
          style={{ ...pedalBtn, borderColor: '#06d6a0' }}
        >
          ACEL
        </button>
      </div>

      {/* Bottom-Right Digital Tachometer, Gear, Boost & Nitro Cluster */}
      <div className="hud-tacho">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <span style={{ fontSize: 42, fontWeight: 900, letterSpacing: -1 }}>
              {Math.round(frame.speedKmh)}
            </span>
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 4 }}>KM/H</span>
          </div>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: rpmPct > 90 ? '#ef233c' : 'rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 900,
              color: '#ffbe0b',
            }}
          >
            {frame.gear === -1 ? 'R' : frame.gear === 0 ? 'N' : frame.gear}
          </div>
        </div>

        {/* RPM Bar */}
        <div style={{ height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden', margin: '6px 0' }}>
          <div
            style={{
              width: `${rpmPct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #00f5d4, #ffbe0b, #ef233c)',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#cbd5e1' }}>
          <span>{Math.round(frame.rpm)} RPM</span>
          <span>NITRO {Math.round(frame.nitroRemainingPct)}%</span>
          <span>CHAS. {Math.round(frame.damage.engineHealth)}%</span>
        </div>

        {/* Damage: one bar per panel, so a hit is legible at a glance */}
        <div className="hud-damage" title="Estado da carroceria">
          {(
            [
              ['F', frame.damage.panelDeform.frontLeft + frame.damage.panelDeform.frontRight],
              ['E', frame.damage.panelDeform.sideLeft],
              ['D', frame.damage.panelDeform.sideRight],
              ['T', frame.damage.panelDeform.rear],
              ['C', frame.damage.panelDeform.hood],
            ] as [string, number][]
          ).map(([label, raw]) => {
            const dmg = Math.max(0, Math.min(1, raw));
            return (
              <div key={label} className="seg" title={`${label}: ${Math.round(dmg * 100)}%`}>
                <span style={{ height: `${8 + dmg * 92}%`, background: dmg > 0.5 ? '#ef233c' : dmg > 0.2 ? '#ffbe0b' : '#06d6a0' }} />
                <em>{label}</em>
              </div>
            );
          })}
        </div>

        {/* Tyre temperatures (inner/mid/outer mean) — the F1-style tell */}
        <div className="hud-tyres" title="Temperatura dos pneus">
          {['FL', 'FR', 'RL', 'RR'].map((label, i) => {
            const w = frame.wheels[i];
            const t = w ? (w.tempInnerC + w.tempMidC + w.tempOuterC) / 3 : 0;
            // 60 °C cold → blue, 90 °C optimal → green, 120 °C+ → red
            const hue = Math.max(0, Math.min(200, 200 - Math.max(0, (t - 60) / 70) * 200));
            return (
              <div key={label} className="tyre" style={{ borderColor: `hsl(${hue} 80% 55%)`, color: `hsl(${hue} 85% 62%)` }}>
                {label}
                <b>{Math.round(t)}°</b>
              </div>
            );
          })}
        </div>
      </div>

      {/* Imported-MP3 mini player (in-race transport) */}
      <MiniPlayer />
    </>
  );
};

/**
 * Compact in-race transport for "Minhas Músicas": prev / play-pause / next,
 * track name and an independent volume slider. Hidden when the library is
 * empty so it never clutters the HUD.
 */
const MiniPlayer: React.FC = () => {
  const [state, setState] = useState<CustomPlayerState>(() => customMusicPlayer.getState());
  const [mode, setMode] = useState<'game' | 'mine'>(() => audioEngine.getMusicMode());
  useEffect(() => {
    const unsub = customMusicPlayer.subscribe(setState);
    const id = window.setInterval(() => setMode(audioEngine.getMusicMode()), 1200);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, []);
  if (state.count === 0) return null;
  return (
    <div className="hud-miniplayer" data-mode={mode}>
      <button
        className="vu-btn vu-btn-icon"
        onClick={() => {
          const nextMode = mode === 'mine' ? 'game' : 'mine';
          audioEngine.init();
          audioEngine.setMusicMode(nextMode);
          if (nextMode === 'mine') customMusicPlayer.play();
          setMode(nextMode);
        }}
        title={mode === 'mine' ? 'Trocando para a trilha do jogo' : 'Trocando para suas músicas'}
        style={{ fontSize: 9, fontWeight: 800, width: 'auto', padding: '0 8px' }}
      >
        {mode === 'mine' ? 'MP3' : 'TRILHA'}
      </button>
      <button className="vu-btn vu-btn-icon" onClick={() => customMusicPlayer.previous()} title="Anterior">
        <SkipBack size={15} />
      </button>
      <button
        className="vu-btn vu-btn-icon"
        style={{ background: '#ff9500', color: '#000', border: 'none' }}
        onClick={() => customMusicPlayer.toggle()}
        title={state.playing ? 'Pausar' : 'Tocar'}
      >
        {state.playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button className="vu-btn vu-btn-icon" onClick={() => customMusicPlayer.next()} title="Próxima">
        <SkipForward size={15} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {state.trackName ?? 'Minhas Músicas'}
        </div>
        <div style={{ fontSize: 9, color: '#94a3b8' }}>
          {state.index + 1}/{state.count} • {state.playing ? 'tocando' : 'pausado'}
        </div>
      </div>
      {state.volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(state.volume * 100)}
        onChange={(e) => audioEngine.setCustomVolume(Number(e.target.value) / 100)}
        title="Volume das minhas músicas"
      />
    </div>
  );
};

interface PhotoProps {
  lut: CinemaLut;
  fov: number;
  rollDeg: number;
  exposure: number;
  hourOfDay: number;
  grainOpacity: number;
  vignetteStrength: number;
  onChange: (next: {
    lut?: CinemaLut;
    fov?: number;
    rollDeg?: number;
    exposure?: number;
    hourOfDay?: number;
    grainOpacity?: number;
    vignetteStrength?: number;
  }) => void;
  onDownloadPng: () => void;
  onSaveToGarageWall: () => void;
  onClose: () => void;
}

export const PhotoModeStudio: React.FC<PhotoProps> = (props) => {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(820px, 95vw)',
        background: 'rgba(8, 12, 22, 0.92)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(255, 190, 11, 0.4)',
        borderRadius: 16,
        padding: 16,
        zIndex: 55,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <span style={{ fontSize: 11, color: '#ffbe0b', fontWeight: 800 }}>
            📸 SEÇÃO 5.6 — MODO FOTOGRAFIA ÓPTICA CINEMATOGRÁFICA (ARRASTE O MOUSE NA CENA PARA GIRAR 360°)
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={props.onSaveToGarageWall} style={{ ...hudBtn, background: '#06d6a0', color: '#041210' }}>
            🖼️ PENDURAR POSTER NA GARAGEM 3D
          </button>
          <button onClick={props.onDownloadPng} style={{ ...hudBtn, background: '#ff9500', color: '#090d16' }}>
            💾 BAIXAR FOTO PNG
          </button>
          <button onClick={props.onClose} style={hudBtn}>
            VOLTAR À CORRIDA
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, fontSize: 11 }}>
        <label style={pLbl}>
          Película / LUT
          <select
            value={props.lut}
            onChange={(e) => props.onChange({ lut: e.target.value as CinemaLut })}
            style={hudBtn}
          >
            <option value="natural">Óptica Natural</option>
            <option value="kodak_portra">Kodak Portra 400</option>
            <option value="fuji_velvia">Fuji Velvia 50</option>
            <option value="teal_orange">Teal & Orange IMAX</option>
            <option value="noir_1940">Noir 1940 P&B</option>
          </select>
        </label>

        <label style={pLbl}>
          Lente FOV: {props.fov}°
          <input
            type="range"
            min={22}
            max={95}
            value={props.fov}
            onChange={(e) => props.onChange({ fov: Number(e.target.value) })}
          />
        </label>

        <label style={pLbl}>
          Inclinação (Roll): {props.rollDeg}°
          <input
            type="range"
            min={-35}
            max={35}
            value={props.rollDeg}
            onChange={(e) => props.onChange({ rollDeg: Number(e.target.value) })}
          />
        </label>

        <label style={pLbl}>
          Exposição ISO: {props.exposure.toFixed(2)}
          <input
            type="range"
            min={0.5}
            max={2.2}
            step={0.05}
            value={props.exposure}
            onChange={(e) => props.onChange({ exposure: Number(e.target.value) })}
          />
        </label>

        <label style={pLbl}>
          Luz Solar: {props.hourOfDay.toFixed(1)}h
          <input
            type="range"
            min={0}
            max={23.9}
            step={0.2}
            value={props.hourOfDay}
            onChange={(e) => props.onChange({ hourOfDay: Number(e.target.value) })}
          />
        </label>

        <label style={pLbl}>
          Bokeh / Vinheta: {Math.round(props.vignetteStrength * 100)}%
          <input
            type="range"
            min={0}
            max={0.85}
            step={0.05}
            value={props.vignetteStrength}
            onChange={(e) => props.onChange({ vignetteStrength: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
};

const hudBtn: React.CSSProperties = {
  background: 'rgba(10, 15, 28, 0.85)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff',
  padding: '7px 10px',
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
};

const pedalBtn: React.CSSProperties = {
  background: 'rgba(10, 15, 28, 0.72)',
  border: '1px solid rgba(255,255,255,0.25)',
  color: '#fff',
  padding: '10px 12px',
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 900,
  cursor: 'pointer',
};

const pLbl: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  color: '#cbd5e1',
};
