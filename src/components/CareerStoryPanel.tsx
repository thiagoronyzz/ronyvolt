import React, { useState } from 'react';
import { CareerChapter, CareerChoice } from '../types/game';
import { CAREER_CHAPTERS } from '../data/careerChapters';
import { BOT_ROSTER } from '../data/botRoster';

interface Props {
  completedChapters: Set<number>;
  chosenOptions: Record<number, string>;
  driverName: string;
  driverPersona: 'fair_play' | 'showman' | 'implacavel';
  reputation: number;
  morality: number;
  onUpdateDriver: (name: string, persona: 'fair_play' | 'showman' | 'implacavel') => void;
  onMakeChoice: (chapterNum: number, choice: CareerChoice) => void;
  onStartChapterRace: (chapter: CareerChapter) => void;
  onClose: () => void;
}

export const CareerStoryPanel: React.FC<Props> = ({
  completedChapters,
  chosenOptions,
  driverName,
  driverPersona,
  reputation,
  morality,
  onUpdateDriver,
  onMakeChoice,
  onStartChapterRace,
  onClose,
}) => {
  const [view, setView] = useState<'chapters' | 'bots'>('chapters');
  const [activeChap, setActiveChap] = useState<CareerChapter>(CAREER_CHAPTERS[0]);
  const [botSearch, setBotSearch] = useState('');

  const filteredBots = BOT_ROSTER.filter(
    (b) =>
      b.name.toLowerCase().includes(botSearch.toLowerCase()) ||
      b.nationality.toLowerCase().includes(botSearch.toLowerCase()) ||
      b.callsign.toLowerCase().includes(botSearch.toLowerCase())
  );

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: '#ffbe0b', fontWeight: 800, letterSpacing: 1.5 }}>
            SEÇÕES 4, 5.1 & 12 — MODO HISTÓRIA (25 CAPÍTULOS) & 200 PILOTOS DE IA PSICOLÓGICA
          </div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Carreira Cinematográfica: Do Galpão com Uno ao Pódio de Mônaco</h2>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setView('chapters')}
            style={{ ...tabBtn, background: view === 'chapters' ? '#ff3b30' : 'rgba(255,255,255,0.08)' }}
          >
            🎬 25 Capítulos & Árvore Moral
          </button>
          <button
            onClick={() => setView('bots')}
            style={{ ...tabBtn, background: view === 'bots' ? '#ff3b30' : 'rgba(255,255,255,0.08)' }}
          >
            🤖 200 Pilotos IA & Rivalidades
          </button>
          <button onClick={onClose} style={tabBtn}>
            FECHAR
          </button>
        </div>
      </div>

      {view === 'chapters' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 14, flex: 1, minHeight: 0 }}>
          {/* Chapter List */}
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 4 }}>
            {CAREER_CHAPTERS.map((ch) => {
              const done = completedChapters.has(ch.chapterNumber);
              const sel = activeChap.chapterNumber === ch.chapterNumber;
              return (
                <button
                  key={ch.chapterNumber}
                  onClick={() => setActiveChap(ch)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: sel ? '2px solid #ffbe0b' : '1px solid rgba(255,255,255,0.08)',
                    background: sel ? 'rgba(255,190,11,0.18)' : 'rgba(15,23,42,0.85)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 10, color: done ? '#06d6a0' : '#94a3b8', fontWeight: 800 }}>
                    CAPÍTULO {String(ch.chapterNumber).padStart(2, '0')} {done ? '✓ CONCLUÍDO' : ''}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>{ch.title}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{ch.subtitle}</div>
                </button>
              );
            })}
          </div>

          {/* Cinematic Cutscene Stage & Branching Choices */}
          <div
            style={{
              background: 'linear-gradient(160deg, rgba(15,23,42,0.95), rgba(8,11,20,0.98))',
              borderRadius: 14,
              padding: 20,
              border: '1px solid rgba(255,190,11,0.28)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: 14,
            }}
          >
            <div>
              {/* Driver Customization Bar */}
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: 10,
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)',
                  marginBottom: 14,
                  alignItems: 'center',
                  fontSize: 12,
                }}
              >
                <span>👤 Piloto:</span>
                <input
                  value={driverName}
                  onChange={(e) => onUpdateDriver(e.target.value, driverPersona)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: 5,
                  }}
                />
                <select
                  value={driverPersona}
                  onChange={(e) => onUpdateDriver(driverName, e.target.value as typeof driverPersona)}
                  style={{
                    background: '#0f172a',
                    border: '1px solid #334155',
                    color: '#fff',
                    padding: '4px 8px',
                    borderRadius: 5,
                  }}
                >
                  <option value="fair_play">Cavalheiro das Pistas (Ganha Aliados)</option>
                  <option value="showman">Showman Carismático (+Patrocínio)</option>
                  <option value="implacavel">Implacável Sem Piedade (Intimida Rivais)</option>
                </select>
                <span style={{ color: '#00f5d4', fontWeight: 700 }}>⭐ Reputação: {reputation}</span>
                <span style={{ color: '#ffbe0b', fontWeight: 700 }}>⚖️ Índole: {morality}</span>
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: 'rgba(56, 189, 248, 0.1)',
                  borderLeft: '3px solid #38bdf8',
                  fontSize: 11,
                  color: '#bae6fd',
                  marginBottom: 12,
                }}
              >
                🎥 <strong>DIREÇÃO DE CUTSCENE (MOCAP / IMAX):</strong> {activeChap.cutsceneDirectorNote}
              </div>

              <h3 style={{ fontSize: 22, margin: '0 0 4px' }}>
                Cap. {activeChap.chapterNumber}: {activeChap.title}
              </h3>
              <div style={{ color: '#ff9500', fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
                {activeChap.characterSpeaker} — {activeChap.characterRole}
              </div>

              <blockquote
                style={{
                  fontSize: 15,
                  lineHeight: 1.65,
                  padding: '14px 16px',
                  background: 'rgba(0,0,0,0.45)',
                  borderRadius: 10,
                  borderLeft: '4px solid #ff9500',
                  marginBottom: 16,
                }}
              >
                “{activeChap.dialogue}”
              </blockquote>

              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8, fontWeight: 700 }}>
                ÁRVORE DE DECISÕES NARRATIVAS (TODA ESCOLHA TEM CONSEQUÊNCIA):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {activeChap.choices.map((c) => {
                  const picked = chosenOptions[activeChap.chapterNumber] === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => onMakeChoice(activeChap.chapterNumber, c)}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        cursor: 'pointer',
                        border: picked ? '2px solid #06d6a0' : '1px solid rgba(255,255,255,0.14)',
                        background: picked ? 'rgba(6, 214, 160, 0.16)' : 'rgba(255,255,255,0.04)',
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                        {picked ? '✓ ' : '👉 '}
                        {c.label}
                      </div>
                      <div style={{ fontSize: 11, color: '#cbd5e1' }}>{c.consequenceText}</div>
                      <div style={{ fontSize: 11, color: '#ffbe0b', marginTop: 6 }}>
                        Créditos: {c.creditsDelta >= 0 ? `+V$ ${c.creditsDelta}` : `-V$ ${Math.abs(c.creditsDelta)}`} • Rep: {c.reputationDelta >= 0 ? `+${c.reputationDelta}` : c.reputationDelta}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>
                Prêmio da Etapa: <strong style={{ color: '#06d6a0' }}>V$ {activeChap.rewardCredits.toLocaleString('pt-BR')}</strong> •{' '}
                {activeChap.laps} Voltas
              </div>
              <button
                onClick={() => onStartChapterRace(activeChap)}
                style={{
                  padding: '12px 22px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(90deg, #ff3b30, #ff9500)',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                🏁 DISPUTAR ETAPA DO CAPÍTULO {activeChap.chapterNumber}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <input
            type="text"
            placeholder="Filtrar entre os 200 pilotos de IA por nome, país ou callsign..."
            value={botSearch}
            onChange={(e) => setBotSearch(e.target.value)}
            style={{
              background: '#111827',
              border: '1px solid #334155',
              color: '#fff',
              padding: '9px 12px',
              borderRadius: 8,
              marginBottom: 10,
            }}
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 8,
              overflowY: 'auto',
            }}
          >
            {filteredBots.map((b) => (
              <div
                key={b.id}
                style={{
                  background: 'rgba(15,23,42,0.88)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: 11,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ffbe0b', fontWeight: 800 }}>
                  <span>{b.name}</span>
                  <span>{b.nationality}</span>
                </div>
                <div style={{ fontSize: 10, color: '#38bdf8', marginBottom: 4 }}>
                  [{b.callsign}] • Idioma Rádio: {b.languageCode}
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>{b.bio}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, fontSize: 10, color: '#e2e8f0' }}>
                  <span>🔥 Agressiv.: {b.aggression}/10</span>
                  <span>🎯 Técnica: {b.skill}/10</span>
                  <span>🛞 Gestão Pneu: {b.tireManagement}/10</span>
                  <span>🤝 Fair Play: {b.sportsmanship}/10</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const wrap: React.CSSProperties = {
  position: 'fixed',
  inset: '54px 18px 18px 18px',
  background: 'rgba(7, 10, 19, 0.96)',
  fontFamily: 'var(--vu-font)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255, 190, 11, 0.3)',
  borderRadius: 16,
  padding: 18,
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
};

const tabBtn: React.CSSProperties = {
  padding: '8px 13px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.18)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
  background: 'rgba(255,255,255,0.08)',
};
