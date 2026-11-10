import React, { useState } from 'react';
import { BiomeTheme, CustomTrackData } from '../types/game';

interface Props {
  initialData: CustomTrackData;
  onTestTrack: (data: CustomTrackData) => void;
  onClose: () => void;
}

export const TrackEditorModal: React.FC<Props> = ({ initialData, onTestTrack, onClose }) => {
  const [name, setName] = useState(initialData.name);
  const [biome, setBiome] = useState<BiomeTheme>(initialData.biome);
  const [roadWidth, setRoadWidth] = useState(initialData.roadWidth);
  const [points, setPoints] = useState(initialData.points);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [communityFeatured, setCommunityFeatured] = useState([
    { title: 'GP do Pão de Queijo — Serra Mineira', votes: 14820, author: 'ThiagoR_MG' },
    { title: 'Cozinha Insana Re-Volt Remix', votes: 11390, author: 'ToyecaMaster99' },
    { title: 'Oito Supersônico de Tóquio', votes: 9850, author: 'AkinaGhost' },
  ]);

  const toScreen = (x: number, z: number) => ({
    sx: 220 + (x / 360) * 190,
    sy: 195 + (z / 360) * 165,
  });

  const fromScreen = (sx: number, sy: number) => ({
    x: Math.round(((sx - 220) / 190) * 360),
    z: Math.round(((sy - 195) / 165) * 360),
  });

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#06d6a0', fontWeight: 800, letterSpacing: 1.4 }}>
            SEÇÃO 5.7 — EDITOR DE PISTAS TERRAFORM & WORKSHOP DA COMUNIDADE
          </div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Criador de Circuitos 3D com Teste Instantâneo</h2>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onTestTrack({ name, biome, roadWidth, points })}
            style={{
              padding: '10px 18px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(90deg, #06d6a0, #00bbf9)',
              color: '#041418',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            🏎️ TESTAR PISTA EM TEMPO REAL AGORA!
          </button>
          <button onClick={onClose} style={btnSec}>
            FECHAR
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '450px 1fr', gap: 16, flex: 1, minHeight: 0 }}>
        {/* Interactive SVG Spline Canvas */}
        <div style={{ background: '#090f1d', borderRadius: 12, padding: 10, border: '1px solid #1e293b' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
            ARRASTE OS CHECKPOINTS AZUIS PARA ESCULPIR O TRAÇADO (CLIQUE DUPLO NO FUNDO ADICIONA NOVO PONTO)
          </div>
          <svg
            width={430}
            height={380}
            style={{ background: '#050811', borderRadius: 8, cursor: 'crosshair' }}
            onPointerMove={(e) => {
              if (draggingIdx === null) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const coords = fromScreen(e.clientX - rect.left, e.clientY - rect.top);
              setPoints((prev) =>
                prev.map((p, i) => (i === draggingIdx ? { ...p, x: coords.x, z: coords.z } : p))
              );
            }}
            onPointerUp={() => setDraggingIdx(null)}
            onDoubleClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const coords = fromScreen(e.clientX - rect.left, e.clientY - rect.top);
              setPoints((prev) => [...prev, { x: coords.x, y: 0, z: coords.z }]);
            }}
          >
            <polygon
              points={points
                .map((p) => {
                  const s = toScreen(p.x, p.z);
                  return `${s.sx},${s.sy}`;
                })
                .join(' ')}
              fill="rgba(0, 245, 212, 0.06)"
              stroke="#00f5d4"
              strokeWidth={roadWidth * 0.45}
              strokeLinejoin="round"
            />
            {points.map((p, idx) => {
              const s = toScreen(p.x, p.z);
              return (
                <g key={idx}>
                  <circle
                    cx={s.sx}
                    cy={s.sy}
                    r={selectedIdx === idx ? 9 : 6.5}
                    fill={idx === 0 ? '#ff3b30' : selectedIdx === idx ? '#ffbe0b' : '#38bdf8'}
                    stroke="#fff"
                    strokeWidth={2}
                    onPointerDown={(ev) => {
                      ev.stopPropagation();
                      setSelectedIdx(idx);
                      setDraggingIdx(idx);
                    }}
                  />
                  <text x={s.sx + 10} y={s.sy + 4} fill="#cbd5e1" fontSize={10}>
                    CP{idx + 1} ({p.y}m)
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Terraform Controls & Workshop */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          <label style={lbl}>
            Nome Oficial do Seu Circuito
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inp}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={lbl}>
              Bioma & Biblioteca de Objetos 3D
              <select value={biome} onChange={(e) => setBiome(e.target.value as BiomeTheme)} style={inp}>
                <option value="interlagos_br">Autódromo Brasileiro + Churrasco</option>
                <option value="neo_tokyo">Neo Tokyo Cyberpunk Noturno</option>
                <option value="sao_paulo">Urbano São Paulo + Grafites</option>
                <option value="touge_sakura">Montanha Japonesa Sakura</option>
                <option value="swiss_alps">Alpes Nevados</option>
                <option value="rc_kitchen">Escala Macro Cozinha Re-Volt</option>
                <option value="mars_colony">Colônia de Marte (0.38g)</option>
              </select>
            </label>

            <label style={lbl}>
              Largura do Asfalto: {roadWidth}m
              <input
                type="range"
                min={9}
                max={26}
                value={roadWidth}
                onChange={(e) => setRoadWidth(Number(e.target.value))}
              />
            </label>
          </div>

          {points[selectedIdx] && (
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.05)' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#ffbe0b', marginBottom: 6 }}>
                ⛰️ Terraformação — Elevação do Checkpoint #{selectedIdx + 1}: {points[selectedIdx].y} metros
              </div>
              <input
                type="range"
                min={0}
                max={35}
                value={points[selectedIdx].y}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setPoints((prev) => prev.map((p, i) => (i === selectedIdx ? { ...p, y: val } : p)));
                }}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {/* Export JSON */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify({ name, biome, roadWidth, points }, null, 2)], {
                  type: 'application/json',
                });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `${name.toLowerCase().replace(/\s+/g, '_')}.json`;
                a.click();
              }}
              style={btnSec}
            >
              💾 Exportar Traçado JSON
            </button>
            <button
              onClick={() => {
                setCommunityFeatured((prev) => [
                  { title: name, votes: 1, author: 'Você (Creator)' },
                  ...prev,
                ]);
              }}
              style={btnSec}
            >
              ☁️ Publicar no Workshop Comunitário
            </button>
          </div>

          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', marginBottom: 6 }}>
              🌟 FEATURED COMMUNITY TRACKS (VOTAÇÃO ABERTA)
            </div>
            {communityFeatured.map((cf, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  background: 'rgba(15,23,42,0.85)',
                  borderRadius: 8,
                  marginBottom: 6,
                  fontSize: 12,
                }}
              >
                <span>
                  <strong>{cf.title}</strong> <span style={{ color: '#94a3b8' }}>por {cf.author}</span>
                </span>
                <button
                  onClick={() =>
                    setCommunityFeatured((prev) =>
                      prev.map((item, idx) => (idx === i ? { ...item, votes: item.votes + 1 } : item))
                    )
                  }
                  style={{ ...btnSec, padding: '4px 10px' }}
                >
                  👍 {cf.votes.toLocaleString('pt-BR')}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const wrap: React.CSSProperties = {
  position: 'fixed',
  inset: '54px 18px 18px 18px',
  background: 'rgba(7, 11, 20, 0.96)',
  fontFamily: 'var(--vu-font)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(6, 214, 160, 0.3)',
  borderRadius: 16,
  padding: 18,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
};

const btnSec: React.CSSProperties = {
  padding: '8px 13px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

const lbl: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#cbd5e1',
};

const inp: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #334155',
  color: '#fff',
  padding: '8px 10px',
  borderRadius: 7,
  fontSize: 12,
};
