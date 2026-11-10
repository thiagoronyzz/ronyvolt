import React from 'react';
import { Gauge, Monitor, SlidersHorizontal, Volume2, X } from 'lucide-react';

export interface GameSettings {
  masterVolume: number; // 0..1 (mute handled separately)
  engineVolume: number; // 0..1.5
  sfxVolume: number; // 0..1.5
  musicVolume: number; // 0..1 (synth soundtrack)
  customVolume: number; // 0..1 (imported MP3s)
  muted: boolean;
  pixelRatioCap: number; // 1 | 1.5 | 2
  bloomEnabled: boolean;
  cameraShakeEnabled: boolean;
  speedBlurEnabled: boolean;
  invertSteering: boolean;
  colorblindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
}

interface Props {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
}

function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="vu-slider-row">
      <span style={{ width: 150, flexShrink: 0 }}>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 0.01}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span style={{ width: 44, textAlign: 'right', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
        {props.format ? props.format(props.value) : `${Math.round(props.value * 100)}%`}
      </span>
    </div>
  );
}

function Section(props: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: '#ff9500',
          marginBottom: 10,
        }}
      >
        {props.icon} {props.title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{props.children}</div>
    </div>
  );
}

export const SettingsModal: React.FC<Props> = ({ settings, onChange, onClose }) => {
  const set = (patch: Partial<GameSettings>) => onChange({ ...settings, ...patch });
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className="vu-overlay" onClick={onClose}>
      <div className="vu-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(620px, 96vw)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="vu-eyebrow">Configurações</div>
            <h2 className="vu-title">Ajustes do Jogo</h2>
            <div className="vu-muted">Áudio, gráficos, controles e acessibilidade. Salvo automaticamente neste dispositivo.</div>
          </div>
          <button className="vu-btn vu-btn-icon" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <Section icon={<Volume2 size={14} />} title="Áudio">
            <SliderRow label="Volume geral" value={settings.masterVolume} min={0} max={1} format={pct} onChange={(v) => set({ masterVolume: v })} />
            <SliderRow label="Motor" value={settings.engineVolume} min={0} max={1.5} format={pct} onChange={(v) => set({ engineVolume: v })} />
            <SliderRow label="Efeitos (colisão, marcha…)" value={settings.sfxVolume} min={0} max={1.5} format={pct} onChange={(v) => set({ sfxVolume: v })} />
            <SliderRow label="Trilha do jogo" value={settings.musicVolume} min={0} max={1} format={pct} onChange={(v) => set({ musicVolume: v })} />
            <SliderRow label="Minhas músicas (MP3)" value={settings.customVolume} min={0} max={1} format={pct} onChange={(v) => set({ customVolume: v })} />
            <label className="vu-toggle">
              <input type="checkbox" checked={settings.muted} onChange={(e) => set({ muted: e.target.checked })} />
              Silenciar tudo
            </label>
          </Section>

          <Section icon={<Monitor size={14} />} title="Gráficos">
            <div className="vu-slider-row">
              <span style={{ width: 150, flexShrink: 0 }}>Qualidade de render</span>
              <select
                className="vu-select"
                value={settings.pixelRatioCap}
                onChange={(e) => set({ pixelRatioCap: Number(e.target.value) })}
                style={{ flex: 1 }}
              >
                <option value={1}>Leve (1x — PC fraco / celular)</option>
                <option value={1.5}>Equilibrada (1.5x)</option>
                <option value={2}>Máxima (2x — nítida)</option>
              </select>
            </div>
            <label className="vu-toggle">
              <input type="checkbox" checked={settings.bloomEnabled} onChange={(e) => set({ bloomEnabled: e.target.checked })} />
              Brilho (bloom) de faróis e sol
            </label>
            <label className="vu-toggle">
              <input type="checkbox" checked={settings.speedBlurEnabled} onChange={(e) => set({ speedBlurEnabled: e.target.checked })} />
              Desfoque de velocidade (motion blur leve)
            </label>
            <label className="vu-toggle">
              <input type="checkbox" checked={settings.cameraShakeEnabled} onChange={(e) => set({ cameraShakeEnabled: e.target.checked })} />
              Vibração da câmera em alta velocidade
            </label>
          </Section>

          <Section icon={<SlidersHorizontal size={14} />} title="Controles">
            <label className="vu-toggle">
              <input type="checkbox" checked={settings.invertSteering} onChange={(e) => set({ invertSteering: e.target.checked })} />
              Inverter direção (volante)
            </label>
            <div className="vu-muted" style={{ fontSize: 11 }}>
              Teclas: W/S acelerar/frear • A/D volante • Espaço freio de mão • Shift nitro • E/Q marcha/power-up • C câmera • H buzina • R
              reposicionar • Esc/P pausa.
            </div>
          </Section>

          <Section icon={<Gauge size={14} />} title="Acessibilidade">
            <div className="vu-slider-row">
              <span style={{ width: 150, flexShrink: 0 }}>Visão de cores</span>
              <select
                className="vu-select"
                value={settings.colorblindMode}
                onChange={(e) => set({ colorblindMode: e.target.value as GameSettings['colorblindMode'] })}
                style={{ flex: 1 }}
              >
                <option value="none">Cores padrão</option>
                <option value="protanopia">Protanopia</option>
                <option value="deuteranopia">Deuteranopia</option>
                <option value="tritanopia">Tritanopia</option>
              </select>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};
