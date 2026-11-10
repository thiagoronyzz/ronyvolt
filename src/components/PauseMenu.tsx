import React from 'react';
import { Home, Play, RotateCcw } from 'lucide-react';

interface Props {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

export const PauseMenu: React.FC<Props> = ({ onResume, onRestart, onQuit }) => (
  <div className="vu-overlay" style={{ zIndex: 70 }}>
    <div className="vu-modal" style={{ width: 'min(420px, 94vw)', textAlign: 'center' }}>
      <div className="vu-eyebrow">Corrida pausada</div>
      <h2 className="vu-title" style={{ fontSize: 26 }}>
        Pit Stop
      </h2>
      <div className="vu-muted" style={{ marginBottom: 18 }}>
        O cronômetro está parado. Respire, ajuste a trilha e volte pra pista.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button className="vu-btn vu-btn-primary" onClick={onResume} style={{ justifyContent: 'center', padding: '12px 16px' }}>
          <Play size={16} /> Continuar correndo
        </button>
        <button className="vu-btn" onClick={onRestart} style={{ justifyContent: 'center', padding: '12px 16px' }}>
          <RotateCcw size={16} /> Reiniciar corrida
        </button>
        <button className="vu-btn" onClick={onQuit} style={{ justifyContent: 'center', padding: '12px 16px' }}>
          <Home size={16} /> Voltar para a garagem
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 14 }}>Esc ou P para continuar</div>
    </div>
  </div>
);
