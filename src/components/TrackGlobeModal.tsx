import React, { useMemo, useState } from 'react';
import { GameMode, TrackCategory, TrackSpec, WeatherPreset } from '../types/game';
import { TRACK_CATALOG, TRACK_CATEGORY_LABELS } from '../data/trackCatalog';
import { WEATHER_PRESETS } from '../data/weatherCatalog';
import { AssistMode } from '../engine/PacejkaPhysics';

export const GAME_MODE_LABELS: { id: GameMode; title: string; badge: string; desc: string }[] = [
  { id: 'quick_race', title: 'Corrida Rápida Completa', badge: '🏁', desc: 'Todos os parâmetros ajustáveis, grid completo e clima dinâmico.' },
  { id: 'revolt_legacy', title: 'Modo Re-Volt Legacy 1999', badge: '⚡', desc: 'Escala RC Macro + Power-ups (Foguetes, Óleo, Estrela, Choque) + opção PSX!' },
  { id: 'drift', title: 'Campeonato D1 Drift', badge: '💨', desc: 'Pontuação por ângulo, velocidade, combos e juízes no rádio!' },
  { id: 'drag', title: 'Arrancada Drag Strip', badge: '🚦', desc: 'Reação no pinheirinho em ms, troca na luz verde e 1/4 de milha!' },
  { id: 'time_trial', title: 'Contra-Relógio + Ghost 3D', badge: '⏱️', desc: 'Grave sua volta ideal e dispute décimo a décimo contra seu Ghost 3D!' },
  { id: 'police_chase', title: 'Perseguição Policial 5★', badge: '🚓', desc: 'Viaturas V8 com sirene tentando fechar seu caminho em alta velocidade!' },
  { id: 'derby', title: 'Arena Destruição Derby', badge: '💥', desc: 'Deformação FEA total — destrua os rivais até sobrar um inteiro!' },
  { id: 'delivery', title: 'Entrega Expressa (Crazy Courier)', badge: '📦', desc: 'Entregue pacotes frágeis nas zonas verdes sem amassar a carga!' },
  { id: 'stunt', title: 'Parque de Acrobacias & Saltos', badge: '🚀', desc: 'Rampas gigantes, airtime e gravidade planetária!' },
  { id: 'multiplayer', title: 'Lobby Online ELO + Anti-Troll IA', badge: '🌐', desc: 'Matchmaking competitivo com Steward Anti-Troll analisando seu volante!' },
  { id: 'championship', title: 'Campeonato Personalizado FIA', badge: '🏆', desc: 'Calendário de etapas, regras técnicas de potência/peso e pontuação.' },
];

interface Props {
  selectedTrack: TrackSpec;
  selectedWeather: WeatherPreset;
  selectedMode: GameMode;
  laps: number;
  botCount: number;
  botDifficulty: number;
  hourOfDay: number;
  assistMode: AssistMode;
  damageEnabled: boolean;
  tireWearEnabled: boolean;
  fuelEnabled: boolean;
  layoutVariant: 'GP' | 'National' | 'Sprint';
  onUpdateConfig: (partial: {
    track?: TrackSpec;
    weather?: WeatherPreset;
    mode?: GameMode;
    laps?: number;
    botCount?: number;
    botDifficulty?: number;
    hourOfDay?: number;
    assistMode?: AssistMode;
    damageEnabled?: boolean;
    tireWearEnabled?: boolean;
    fuelEnabled?: boolean;
    layoutVariant?: 'GP' | 'National' | 'Sprint';
  }) => void;
  onLaunchRace: () => void;
  onClose: () => void;
}

export const TrackGlobeModal: React.FC<Props> = (props) => {
  const [cat, setCat] = useState<TrackCategory | 'all'>('all');
  const [query, setQuery] = useState('');

  const filteredTracks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRACK_CATALOG.filter((t) => {
      if (cat !== 'all' && t.category !== cat) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.country.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [cat, query]);

  return (
    <div style={wrapStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: '#00f5d4', fontWeight: 800, letterSpacing: 1.5 }}>
            SEÇÕES 3 & 5 — {TRACK_CATALOG.length} CENÁRIOS MUNDIAIS • {WEATHER_PRESETS.length} CLIMAS DINÂMICOS • 14 MODOS
          </div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Atlas Geográfico & Controle de Corrida</h2>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={props.onLaunchRace} style={launchBtn}>
            🚦 ACELERAR AGORA EM {props.selectedTrack.name.split('—')[0].trim().toUpperCase()}!
          </button>
          <button onClick={props.onClose} style={closeBtn}>
            FECHAR
          </button>
        </div>
      </div>

      {/* Mode Selector Strip */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 10 }}>
        {GAME_MODE_LABELS.map((m) => {
          const active = props.selectedMode === m.id;
          return (
            <button
              key={m.id}
              onClick={() => props.onUpdateConfig({ mode: m.id })}
              style={{
                minWidth: 165,
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 8,
                border: active ? '2px solid #ff9500' : '1px solid rgba(255,255,255,0.1)',
                background: active ? 'rgba(255,149,0,0.2)' : 'rgba(17,24,39,0.85)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 12 }}>
                {m.badge} {m.title}
              </div>
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{m.desc}</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.65fr 1fr', gap: 14, flex: 1, minHeight: 0 }}>
        {/* Left: 205 Track Browser */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
            <button
              onClick={() => setCat('all')}
              style={{ ...pill, background: cat === 'all' ? '#00bbf9' : 'rgba(255,255,255,0.08)' }}
            >
              Todas ({TRACK_CATALOG.length})
            </button>
            {(Object.keys(TRACK_CATEGORY_LABELS) as TrackCategory[]).map((tc) => (
              <button
                key={tc}
                onClick={() => setCat(tc)}
                style={{ ...pill, background: cat === tc ? '#00bbf9' : 'rgba(255,255,255,0.08)' }}
              >
                {TRACK_CATEGORY_LABELS[tc]}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Buscar pista (ex: Interlagos, Nürburgring, São Paulo, Neo Tokyo, Cozinha, Banheiro, Ovelhas, Marte...)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={inputBox}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))',
              gap: 8,
              overflowY: 'auto',
              marginTop: 8,
              paddingRight: 4,
            }}
          >
            {filteredTracks.map((tr) => {
              const sel = props.selectedTrack.id === tr.id;
              return (
                <div
                  key={tr.id}
                  onClick={() => {
                    const defaultW = WEATHER_PRESETS.find((w) => w.id === tr.defaultWeatherId) ?? props.selectedWeather;
                    props.onUpdateConfig({
                      track: tr,
                      weather: defaultW,
                      hourOfDay: tr.defaultHour,
                      mode: tr.category === 'rc_revolt' ? 'revolt_legacy' : props.selectedMode,
                    });
                  }}
                  style={{
                    padding: 10,
                    borderRadius: 9,
                    cursor: 'pointer',
                    background: sel ? 'rgba(0, 187, 249, 0.22)' : 'rgba(15, 23, 42, 0.85)',
                    border: sel ? '2px solid #00f5d4' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 700 }}>
                    {tr.country} • {tr.lengthKm} km • {tr.corners} curvas • {tr.gravityG}g
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13, margin: '3px 0' }}>{tr.name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.35 }}>{tr.description}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: 47 Weather Presets, Time of Day & Simulation Rules */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.9)',
            borderRadius: 12,
            padding: 14,
            border: '1px solid rgba(255,255,255,0.1)',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, color: '#ffbe0b' }}>
            🌦️ Clima Dinâmico (47 Variações Físicas) & Regras
          </div>

          <label style={lbl}>
            Condição Meteorológica Ativa
            <select
              value={props.selectedWeather.id}
              onChange={(e) => {
                const w = WEATHER_PRESETS.find((x) => x.id === e.target.value);
                if (w) props.onUpdateConfig({ weather: w });
              }}
              style={inputBox}
            >
              {WEATHER_PRESETS.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} (Grip {Math.round(w.gripMultiplier * 100)}% | Vento {w.windSpeedKmh} km/h)
                </option>
              ))}
            </select>
          </label>

          <label style={lbl}>
            Hora do Dia (Ciclo Solar Contínuo): {Math.floor(props.hourOfDay).toString().padStart(2, '0')}:
            {Math.floor((props.hourOfDay % 1) * 60).toString().padStart(2, '0')}h
            <input
              type="range"
              min={0}
              max={23.9}
              step={0.2}
              value={props.hourOfDay}
              onChange={(e) => props.onUpdateConfig({ hourOfDay: Number(e.target.value) })}
            />
          </label>

          {props.selectedTrack.layoutVariants && (
            <label style={lbl}>
              Variação de Traçado do Circuito
              <select
                value={props.layoutVariant}
                onChange={(e) => props.onUpdateConfig({ layoutVariant: e.target.value as 'GP' | 'National' | 'Sprint' })}
                style={inputBox}
              >
                <option value="GP">Traçado Completo Grand Prix (GP)</option>
                <option value="National">Traçado Nacional Intermediário</option>
                <option value="Sprint">Traçado Curto Club Sprint</option>
              </select>
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={lbl}>
              Voltas: {props.laps}
              <input
                type="range"
                min={1}
                max={25}
                value={props.laps}
                onChange={(e) => props.onUpdateConfig({ laps: Number(e.target.value) })}
              />
            </label>
            <label style={lbl}>
              Carros IA no Grid: {props.botCount}
              <input
                type="range"
                min={0}
                max={19}
                value={props.botCount}
                onChange={(e) => props.onUpdateConfig({ botCount: Number(e.target.value) })}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={lbl}>
              Nível Neural dos Bots: {props.botDifficulty}/10
              <input
                type="range"
                min={1}
                max={10}
                value={props.botDifficulty}
                onChange={(e) => props.onUpdateConfig({ botDifficulty: Number(e.target.value) })}
              />
            </label>
            <label style={lbl}>
              Física & Assistências
              <select
                value={props.assistMode}
                onChange={(e) => props.onUpdateConfig({ assistMode: e.target.value as AssistMode })}
                style={inputBox}
              >
                <option value="casual">Casual Assistido (ABS + TCS)</option>
                <option value="pro">Pro Realista Equilibrado</option>
                <option value="hardcore_sim">Simulação Pacejka Pura (Manual)</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={props.damageEnabled}
                onChange={(e) => props.onUpdateConfig({ damageEnabled: e.target.checked })}
              />
              Deformação FEA + Dano Mecânico + Vazamento de Óleo
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={props.tireWearEnabled}
                onChange={(e) => props.onUpdateConfig({ tireWearEnabled: e.target.checked })}
              />
              Desgaste Térmico e Furo Realista de Pneus
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={props.fuelEnabled}
                onChange={(e) => props.onUpdateConfig({ fuelEnabled: e.target.checked })}
              />
              Consumo Dinâmico de Combustível & Massa
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

const wrapStyle: React.CSSProperties = {
  position: 'fixed',
  inset: '54px 18px 18px 18px',
  background: 'rgba(7, 11, 20, 0.96)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(0, 245, 212, 0.28)',
  borderRadius: 16,
  padding: 18,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
};

const launchBtn: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(90deg, #06d6a0, #00bbf9)',
  color: '#041318',
  fontWeight: 900,
  fontSize: 13,
  cursor: 'pointer',
};

const closeBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

const pill: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 999,
  border: 'none',
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};

const inputBox: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #334155',
  color: '#f8fafc',
  padding: '8px 10px',
  borderRadius: 7,
  fontSize: 12,
};

const lbl: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#cbd5e1',
};
