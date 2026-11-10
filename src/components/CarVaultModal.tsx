import React, { useMemo, useState } from 'react';
import { CarCategory, CarSpec } from '../types/game';
import { CAR_CATALOG, CATEGORY_LABELS } from '../data/carCatalog';

interface Props {
  selectedCar: CarSpec;
  ownedIds: Set<string>;
  unlockedEasterIds: Set<string>;
  producerUnlockAll: boolean;
  credits: number;
  onToggleProducerUnlockAll: () => void;
  onSelectCar: (car: CarSpec) => void;
  onBuyCar: (car: CarSpec) => void;
  onSubmitSecretCode: (code: string) => string | null;
  onClose: () => void;
}

export const CarVaultModal: React.FC<Props> = ({
  selectedCar,
  ownedIds,
  unlockedEasterIds,
  producerUnlockAll,
  credits,
  onToggleProducerUnlockAll,
  onSelectCar,
  onBuyCar,
  onSubmitSecretCode,
  onClose,
}) => {
  const [cat, setCat] = useState<CarCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [puzzleFeedback, setPuzzleFeedback] = useState<string | null>(null);
  const [loreCar, setLoreCar] = useState<CarSpec | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CAR_CATALOG.filter((c) => {
      if (cat !== 'all' && c.category !== cat) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.brand.toLowerCase().includes(q) ||
        c.country.toLowerCase().includes(q) ||
        String(c.year).includes(q)
      );
    });
  }, [cat, query]);

  return (
    <div style={modalWrap}>
      <div style={headerRow}>
        <div>
          <div style={{ fontSize: 11, color: '#ff9500', fontWeight: 800, letterSpacing: 1.5 }}>
            SEÇÃO 2.1 — ARSENAL OBSCENO ({CAR_CATALOG.length} VEÍCULOS JOGÁVEIS)
          </div>
          <h2 style={{ margin: 0, fontSize: 21 }}>Garagem Mundial & Concessionária Ética (Zero Pay-To-Win)</h2>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={onToggleProducerUnlockAll}
            style={{
              padding: '7px 12px',
              borderRadius: 6,
              border: '1px solid #ffbe0b',
              background: producerUnlockAll ? '#ffbe0b' : 'rgba(255,190,11,0.14)',
              color: producerUnlockAll ? '#090d16' : '#ffbe0b',
              fontWeight: 800,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            {producerUnlockAll ? '👑 CHAVE DO PRODUTOR ATIVA (888 LIBERADOS)' : '👑 ATIVAR CHAVE DO PRODUTOR (LIBERAR 888)'}
          </button>
          <button onClick={onClose} style={closeBtn}>
            VOLTAR À GARAGEM 3D
          </button>
        </div>
      </div>

      {/* Category Filter Pills + Search + Secret Easter Egg Decoder */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <button
          onClick={() => setCat('all')}
          style={{
            ...pillStyle,
            background: cat === 'all' ? '#ff3b30' : 'rgba(255,255,255,0.07)',
          }}
        >
          Todos ({CAR_CATALOG.length})
        </button>
        {(Object.keys(CATEGORY_LABELS) as CarCategory[]).map((k) => {
          const count = CAR_CATALOG.filter((c) => c.category === k).length;
          return (
            <button
              key={k}
              onClick={() => setCat(k)}
              style={{
                ...pillStyle,
                background: cat === k ? '#ff3b30' : 'rgba(255,255,255,0.07)',
              }}
            >
              {CATEGORY_LABELS[k]} ({count})
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 10, marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Pesquisar entre 888 carros (ex: Uno 2005, Senna, Gullwing, Chiron, GT3 RS, Sofá, Toyeca...)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={searchBox}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="Decodificador Puzzle Easter Egg (ex: 88MPH, SONECA, OFERTA99...)"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value.toUpperCase())}
            style={{ ...searchBox, flex: 1 }}
          />
          <button
            onClick={() => {
              const res = onSubmitSecretCode(secretInput);
              setPuzzleFeedback(res);
              setSecretInput('');
            }}
            style={{
              padding: '0 14px',
              borderRadius: 8,
              border: 'none',
              background: '#00f5d4',
              color: '#041014',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            DECIFRAR
          </button>
        </div>
      </div>

      {puzzleFeedback && (
        <div
          style={{
            padding: '7px 12px',
            marginBottom: 8,
            borderRadius: 6,
            background: 'rgba(0, 245, 212, 0.16)',
            border: '1px solid #00f5d4',
            fontSize: 12,
          }}
        >
          🧩 {puzzleFeedback}
        </div>
      )}

      {/* Car Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(265px, 1fr))',
          gap: 10,
          overflowY: 'auto',
          maxHeight: '62vh',
          paddingRight: 4,
        }}
      >
        {filtered.map((car) => {
          const isEasterLocked =
            car.category === 'exotic_easter' && !producerUnlockAll && !unlockedEasterIds.has(car.id);
          const isOwned = producerUnlockAll || ownedIds.has(car.id) || unlockedEasterIds.has(car.id);
          const isSelected = selectedCar.id === car.id;

          return (
            <div
              key={car.id}
              style={{
                background: isSelected
                  ? 'linear-gradient(145deg, rgba(255,59,48,0.26), rgba(15,23,42,0.95))'
                  : 'rgba(17, 24, 39, 0.88)',
                border: isSelected ? '2px solid #ff9500' : '1px solid rgba(255,255,255,0.09)',
                borderRadius: 10,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8' }}>
                  <span>
                    {car.brand} • {car.year} • {car.country}
                  </span>
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: car.defaultColor,
                      display: 'inline-block',
                      border: '1px solid #fff',
                    }}
                  />
                </div>
                <div style={{ fontWeight: 800, fontSize: 14, marginTop: 3 }}>{car.name}</div>

                <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#cbd5e1', marginTop: 6 }}>
                  <span>⚡ {car.horsepower} cv</span>
                  <span>⚖️ {car.weightKg} kg</span>
                  <span>🚀 {car.topSpeedKmh} km/h</span>
                  <span>🔄 {car.drivetrain}</span>
                </div>

                {car.specialFeatures && car.specialFeatures.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#ffbe0b' }}>
                    ★ {car.specialFeatures[0]}
                  </div>
                )}

                {isEasterLocked && car.easterEggPuzzleHint && (
                  <div
                    style={{
                      marginTop: 6,
                      padding: 6,
                      borderRadius: 6,
                      background: 'rgba(114,9,183,0.28)',
                      fontSize: 11,
                      color: '#e0aaff',
                    }}
                  >
                    🔒 <strong>Puzzle Secreto:</strong> {car.easterEggPuzzleHint}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                {car.isOriginalHypercar && car.lore && (
                  <button
                    onClick={() => setLoreCar(car)}
                    style={{
                      padding: '6px 9px',
                      borderRadius: 6,
                      border: '1px solid #38bdf8',
                      background: 'rgba(56,189,248,0.14)',
                      color: '#38bdf8',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    📖 CODEX LORE
                  </button>
                )}

                {isOwned ? (
                  <button
                    onClick={() => {
                      onSelectCar(car);
                      onClose();
                    }}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: isSelected ? '#06d6a0' : 'linear-gradient(90deg, #ff3b30, #ff9500)',
                      color: isSelected ? '#041410' : '#fff',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {isSelected ? '✓ NA PLATAFORMA 3D' : 'PILOTAR / INSPECIONAR'}
                  </button>
                ) : isEasterLocked ? (
                  <button
                    disabled
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: '1px solid #555',
                      background: '#1f2937',
                      color: '#9ca3af',
                      fontSize: 11,
                    }}
                  >
                    DECIFRE O CÓDIGO ACIMA
                  </button>
                ) : (
                  <button
                    onClick={() => onBuyCar(car)}
                    disabled={credits < car.priceCredits}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: 'none',
                      background: credits >= car.priceCredits ? '#ffbe0b' : '#334155',
                      color: credits >= car.priceCredits ? '#090d16' : '#94a3b8',
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: credits >= car.priceCredits ? 'pointer' : 'not-allowed',
                    }}
                  >
                    COMPRAR V$ {car.priceCredits.toLocaleString('pt-BR')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Original Hypercar Codex Modal */}
      {loreCar && loreCar.lore && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(4,7,15,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 80,
            padding: 20,
          }}
        >
          <div
            style={{
              maxWidth: 680,
              width: '100%',
              maxHeight: '84vh',
              overflowY: 'auto',
              background: '#0d1322',
              border: '1px solid #38bdf8',
              borderRadius: 14,
              padding: 22,
            }}
          >
            <div style={{ fontSize: 11, color: '#38bdf8', fontWeight: 800 }}>
              DOSSIÊ DE ENGENHARIA & LORE OFICIAL — HYPERCAR ORIGINAL VELOCITY
            </div>
            <h2 style={{ margin: '4px 0 8px' }}>{loreCar.name}</h2>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>
              <strong>Fabricante:</strong> {loreCar.lore.manufacturer} ({loreCar.lore.foundedYear}) •{' '}
              <strong>Sede:</strong> {loreCar.lore.headquarters} • <strong>Chief Designer:</strong>{' '}
              {loreCar.lore.chiefDesigner}
            </div>
            {loreCar.lore.codexChapters.map((ch, idx) => (
              <div key={idx} style={{ marginBottom: 14 }}>
                <h4 style={{ color: '#ffbe0b', marginBottom: 4 }}>{ch.title}</h4>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: '#e2e8f0' }}>{ch.content}</p>
              </div>
            ))}
            <button onClick={() => setLoreCar(null)} style={closeBtn}>
              FECHAR DOSSIÊ TÉCNICO
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const modalWrap: React.CSSProperties = {
  position: 'fixed',
  inset: '54px 18px 18px 18px',
  background: 'rgba(8, 12, 22, 0.95)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 16,
  padding: 18,
  fontFamily: 'var(--vu-font)',
  zIndex: 50,
  display: 'flex',
  flexDirection: 'column',
};

const headerRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 12,
  flexWrap: 'wrap',
  gap: 8,
};

const closeBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.22)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  cursor: 'pointer',
};

const pillStyle: React.CSSProperties = {
  padding: '6px 11px',
  borderRadius: 999,
  border: 'none',
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
};

const searchBox: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #334155',
  color: '#f8fafc',
  padding: '9px 12px',
  borderRadius: 8,
  fontSize: 13,
};
