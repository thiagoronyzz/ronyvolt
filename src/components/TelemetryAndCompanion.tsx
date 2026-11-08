import React, { useState } from 'react';
import { LiveTelemetryFrame } from '../types/game';

interface TelemetryProps {
  frame: LiveTelemetryFrame;
  onExportCsv: () => void;
  onClose: () => void;
}

export const TelemetryOverlay: React.FC<TelemetryProps> = ({ frame, onExportCsv, onClose }) => {
  const tireTempColor = (c: number) => {
    if (c < 55) return '#38bdf8';
    if (c < 98) return '#06d6a0';
    if (c < 118) return '#ffbe0b';
    return '#ef233c';
  };

  const gDotX = 55 + Math.max(-45, Math.min(45, frame.gForceLat * 18));
  const gDotY = 55 - Math.max(-45, Math.min(45, frame.gForceLong * 18));

  return (
    <div
      style={{
        position: 'fixed',
        top: 64,
        left: 16,
        width: 355,
        background: 'rgba(6, 10, 19, 0.9)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(0, 245, 212, 0.35)',
        borderRadius: 12,
        padding: 12,
        zIndex: 35,
        fontSize: 11,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ color: '#00f5d4', letterSpacing: 1 }}>📊 TELEMETRIA FIA/NERD AO VIVO</strong>
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={onExportCsv} style={miniBtn}>
            📥 CSV EXCEL
          </button>
          <button onClick={onClose} style={miniBtn}>
            ✕
          </button>
        </div>
      </div>

      {/* G-G Diagram + Aero & Engine Thermals */}
      <div style={{ display: 'grid', gridTemplateColumns: '115px 1fr', gap: 10, marginBottom: 10 }}>
        <svg width={110} height={110} style={{ background: '#0b1222', borderRadius: 8 }}>
          <circle cx={55} cy={55} r={44} fill="none" stroke="#1e293b" strokeWidth={1} />
          <circle cx={55} cy={55} r={22} fill="none" stroke="#1e293b" strokeWidth={1} />
          <line x1={55} y1={5} x2={55} y2={105} stroke="#1e293b" />
          <line x1={5} y1={55} x2={105} y2={55} stroke="#1e293b" />
          <circle cx={gDotX} cy={gDotY} r={5} fill="#ff3b30" />
          <text x={8} y={16} fill="#94a3b8" fontSize={9}>
            {frame.gForceLat.toFixed(1)}G / {frame.gForceLong.toFixed(1)}G
          </text>
        </svg>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'center' }}>
          <div>🌡️ Água Motor: <strong>{frame.engineTempC.toFixed(1)}°C</strong> | Óleo: <strong>{frame.oilTempC.toFixed(0)}°C</strong></div>
          <div>🔥 Discos Freio: <strong style={{ color: frame.brakeTempC > 550 ? '#ff5722' : '#fff' }}>{frame.brakeTempC.toFixed(0)}°C</strong></div>
          <div>🌀 Turbo Boost: <strong>{frame.boostPsi.toFixed(1)} PSI</strong></div>
          <div>⛽ Combustível: <strong>{frame.fuelLiters.toFixed(2)} L</strong></div>
          <div>🌬️ Downforce: <strong>{Math.round(frame.downforceN)} N</strong> | Drag: <strong>{Math.round(frame.dragN)} N</strong></div>
          <div>🏎️ Vácuo (Draft): <strong style={{ color: '#00f5d4' }}>{Math.round(frame.slipstreamFactor * 100)}%</strong></div>
          <div>🛣️ Piso: <strong>{frame.surfaceName}</strong></div>
        </div>
      </div>

      {/* 4-Tire Inner/Mid/Outer Thermal Heatmap */}
      <div style={{ fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
        MAPA TÉRMICO 3 ZONAS POR PNEU (INT / CENTRO / EXT) & DESGASTE
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {(['FL (Diant. Esq)', 'FR (Diant. Dir)', 'RL (Tras. Esq)', 'RR (Tras. Dir)'] as const).map((lbl, idx) => {
          const w = frame.wheels[idx];
          return (
            <div
              key={lbl}
              style={{
                background: '#0f172a',
                borderRadius: 7,
                padding: 6,
                border: w.punctured ? '1px solid #ef233c' : '1px solid #1e293b',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <strong>{lbl}</strong>
                <span>{w.pressurePsi} PSI</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, margin: '4px 0' }}>
                {[w.tempInnerC, w.tempMidC, w.tempOuterC].map((tc, zIdx) => (
                  <div
                    key={zIdx}
                    style={{
                      background: tireTempColor(tc),
                      color: '#041014',
                      fontWeight: 800,
                      textAlign: 'center',
                      borderRadius: 3,
                      padding: '2px 0',
                      fontSize: 10,
                    }}
                  >
                    {Math.round(tc)}°
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: w.punctured ? '#ef233c' : '#cbd5e1' }}>
                {w.punctured ? '💥 PNEU FURADO (ARO RASPANDO!)' : `Borracha: ${w.wearPercent.toFixed(0)}%`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface CompanionProps {
  frame: LiveTelemetryFrame | null;
  credits: number;
  carName: string;
  onEarnMiniGameCredits: (amount: number) => void;
  onClose: () => void;
}

export const CompanionAppModal: React.FC<CompanionProps> = ({
  frame,
  credits,
  carName,
  onEarnMiniGameCredits,
  onClose,
}) => {
  const [stintLaps, setStintLaps] = useState(12);
  const [burnPerLap, setBurnPerLap] = useState(2.8);
  const [miniPos, setMiniPos] = useState(1);
  const [miniStreak, setMiniStreak] = useState(0);

  const recommendedFuel = Math.ceil(stintLaps * burnPerLap + 3.5);

  return (
    <div
      style={{
        position: 'fixed',
        top: 58,
        right: 18,
        width: 360,
        bottom: 20,
        background: 'linear-gradient(180deg, #0b132b, #060913)',
        border: '2px solid #38bdf8',
        borderRadius: 26,
        padding: 16,
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
      }}
    >
      <div style={{ overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 800 }}>
              📱 VELOCITY COMPANION APP (iOS / ANDROID SYNC)
            </div>
            <strong style={{ fontSize: 16 }}>Segundo Monitor & Pit Wall</strong>
          </div>
          <button onClick={onClose} style={miniBtn}>
            FECHAR
          </button>
        </div>

        {/* Ethical Economy Guarantee */}
        <div
          style={{
            padding: 9,
            borderRadius: 10,
            background: 'rgba(6, 214, 160, 0.14)',
            border: '1px solid #06d6a0',
            fontSize: 11,
            marginBottom: 12,
          }}
        >
          🛡️ <strong>ECONOMIA 100% ÉTICA (SEÇÃO 10.3):</strong> Zero Lootboxes. Zero Pay-to-Win. Saldo ganho exclusivamente na pista: <strong>V$ {credits.toLocaleString('pt-BR')}</strong>
        </div>

        {/* Live Second Screen Telemetry */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 10, marginBottom: 12, fontSize: 12 }}>
          <div style={{ color: '#94a3b8', fontSize: 10 }}>VEÍCULO SINCRONIZADO</div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>{carName}</div>
          {frame ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>Veloc.: <strong>{Math.round(frame.speedKmh)} km/h</strong></div>
              <div>Marcha: <strong>{frame.gear === -1 ? 'R' : frame.gear}</strong></div>
              <div>RPM: <strong>{Math.round(frame.rpm)}</strong></div>
              <div>Saúde Motor: <strong>{Math.round(frame.damage.engineHealth)}%</strong></div>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Estacionado na Garagem 3D</div>
          )}
        </div>

        {/* Pit Strategy Calculator */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 10, marginBottom: 12, fontSize: 12 }}>
          <div style={{ fontWeight: 800, color: '#ffbe0b', marginBottom: 6 }}>
            🧮 Calculadora Estratégica de Pit Stop
          </div>
          <label style={{ display: 'block', marginBottom: 6 }}>
            Voltas do Stint: {stintLaps}
            <input
              type="range"
              min={3}
              max={40}
              value={stintLaps}
              onChange={(e) => setStintLaps(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 6 }}>
            Consumo Médio: {burnPerLap.toFixed(1)} L/volta
            <input
              type="range"
              min={1.2}
              max={6.5}
              step={0.2}
              value={burnPerLap}
              onChange={(e) => setBurnPerLap(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
          <div style={{ color: '#00f5d4', fontWeight: 800 }}>
            Abastecimento Ideal c/ Margem Safety Car: {recommendedFuel} Litros
          </div>
        </div>

        {/* 2D Pocket Mini-Racer for Earning Credits */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 10, fontSize: 12 }}>
          <div style={{ fontWeight: 800, color: '#ff9500', marginBottom: 4 }}>
            🎮 Mini-Game Mobile 2D (Ganhe V$ Longe do PC!)
          </div>
          <div style={{ fontSize: 11, color: '#cbd5e1', marginBottom: 8 }}>
            Troque de faixa para ultrapassar o tráfego e faturar créditos limpos! Sequência: {miniStreak}x
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 6,
              background: '#090d16',
              padding: 10,
              borderRadius: 8,
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {[0, 1, 2].map((lane) => (
              <div
                key={lane}
                style={{
                  padding: '12px 0',
                  borderRadius: 6,
                  background: miniPos === lane ? 'rgba(0,245,212,0.2)' : 'rgba(255,255,255,0.03)',
                  border: miniPos === lane ? '1px solid #00f5d4' : '1px dashed #334155',
                  fontSize: 20,
                }}
              >
                {miniPos === lane ? '🏎️' : '🛣️'}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 1, 2].map((lane) => (
              <button
                key={lane}
                onClick={() => {
                  setMiniPos(lane);
                  setMiniStreak((s) => s + 1);
                  onEarnMiniGameCredits(450);
                }}
                style={{ ...miniBtn, flex: 1, padding: '8px 0' }}
              >
                Faixa {lane + 1} (+V$450)
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 10, color: '#64748b', marginTop: 8 }}>
        Servidores Dedicados &lt;22ms • Rollback Netcode Ativo
      </div>
    </div>
  );
};

const miniBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.22)',
  color: '#fff',
  padding: '4px 9px',
  borderRadius: 6,
  fontSize: 10,
  fontWeight: 800,
  cursor: 'pointer',
};
