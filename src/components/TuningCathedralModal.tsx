import React, { useState } from 'react';
import {
  CarSpec,
  CarTuneSetup,
  PaintFinish,
  PlateRegion,
  TireBrand,
  TireCompound,
  TransmissionType,
} from '../types/game';
import { STICKER_LIBRARY, WHEEL_CATALOG } from '../data/carCatalog';
import { computeEffectiveCarStats, ENGINE_SWAPS } from '../engine/PacejkaPhysics';
import { audioEngine } from '../audio/VelocityAudioEngine';

interface Props {
  car: CarSpec;
  tune: CarTuneSetup;
  onChangeTune: (next: CarTuneSetup) => void;
  onToggleCfd: (visible: boolean) => void;
  cfdVisible: boolean;
  onClose: () => void;
}

export const TuningCathedralModal: React.FC<Props> = ({
  car,
  tune,
  onChangeTune,
  onToggleCfd,
  cfdVisible,
  onClose,
}) => {
  const [tab, setTab] = useState<'motor' | 'transmissao' | 'susp_aero' | 'visual_rodas' | 'som_placa'>('motor');
  const stats = computeEffectiveCarStats(car, tune);

  const update = <K extends keyof CarTuneSetup>(key: K, val: CarTuneSetup[K]) => {
    onChangeTune({ ...tune, [key]: val });
  };

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: '#ff9500', fontWeight: 700, letterSpacing: 1.4 }}>
            SEÇÃO 2.3 — A CATEDRAL DA PERSONALIZAÇÃO
          </div>
          <h2 style={{ fontSize: 19, margin: 0 }}>{car.name}</h2>
        </div>
        <button onClick={onClose} style={closeBtnStyle}>
          FECHAR [ESC]
        </button>
      </div>

      {/* Live Computed Engineering Summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          padding: 10,
          borderRadius: 8,
          background: 'rgba(255,255,255,0.05)',
          marginBottom: 10,
          fontSize: 12,
        }}
      >
        <div>
          <span style={{ color: '#94a3b8' }}>POTÊNCIA</span>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#ffbe0b' }}>{stats.effectiveHp} cv</div>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>TORQUE</span>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#00f5d4' }}>{stats.effectiveTorqueNm} Nm</div>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>PESO (C/ COMB.)</span>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{stats.effectiveWeightKg} kg</div>
        </div>
        <div>
          <span style={{ color: '#94a3b8' }}>AERO Cl / Cd</span>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#38bdf8' }}>
            {stats.clDownforce.toFixed(2)} / {stats.cdDrag.toFixed(2)}
          </div>
        </div>
      </div>

      {stats.chassisOverloaded && (
        <div
          style={{
            background: 'rgba(239, 35, 60, 0.22)',
            border: '1px solid #ef233c',
            borderRadius: 6,
            padding: '7px 10px',
            marginBottom: 10,
            fontSize: 12,
            color: '#ffd6da',
          }}
        >
          ⚠️ <strong>ALERTA DE CHASSI & CENTRO DE GRAVIDADE:</strong> Potência {stats.effectiveHp}cv excede 3.5× o projeto original com molas macias ({tune.springRateFrontNmm} N/mm). Risco físico real de destracionar e capotar nas zebras!
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          ['motor', '🔥 Motor & Nitro'],
          ['transmissao', '⚙️ Câmbio & Curva'],
          ['susp_aero', '🌬️ Suspensão & CFD'],
          ['visual_rodas', '🎨 Pintura, 500 Rodas & Pneus'],
          ['som_placa', '🔊 Paredão, Placa & Easter Eggs'],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id as typeof tab)}
            style={{
              ...tabBtnStyle,
              background: tab === id ? 'linear-gradient(90deg, #ff3b30, #ff9500)' : 'rgba(255,255,255,0.07)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ overflowY: 'auto', maxHeight: '54vh', paddingRight: 6 }}>
        {tab === 'motor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <label style={lblStyle}>
              Swap Completo de Motor (Sim, V12 ou W16 no Uno é permitido!)
              <select
                value={tune.engineSwap ?? car.engineType}
                onChange={(e) => update('engineSwap', e.target.value as CarSpec['engineType'])}
                style={inputStyle}
              >
                {ENGINE_SWAPS.map((es) => (
                  <option key={es.type} value={es.type}>
                    {es.label} [{es.engineWeightKg} kg]
                  </option>
                ))}
              </select>
            </label>

            <div style={grid2}>
              <label style={lblStyle}>
                Sobrealimentação
                <select
                  value={tune.induction}
                  onChange={(e) => update('induction', e.target.value as CarTuneSetup['induction'])}
                  style={inputStyle}
                >
                  <option value="na">Naturalmente Aspirado (ITBs)</option>
                  <option value="turbo">Single Turbo Grande (Turbo Lag + BOV)</option>
                  <option value="twin_turbo">Twin-Turbo Sequencial</option>
                  <option value="supercharger">Supercharger Roots (Whine Agudo)</option>
                </select>
              </label>

              <label style={lblStyle}>
                Pressão do Turbo: {tune.boostPsi} PSI
                <input
                  type="range"
                  min={0}
                  max={42}
                  value={tune.boostPsi}
                  disabled={tune.induction === 'na'}
                  onChange={(e) => update('boostPsi', Number(e.target.value))}
                />
              </label>
            </div>

            <div style={grid2}>
              <label style={lblStyle}>
                Mistura Ar/Combustível (Cor da Chama do Escape!)
                <select
                  value={tune.afrMixture}
                  onChange={(e) => update('afrMixture', e.target.value as CarTuneSetup['afrMixture'])}
                  style={inputStyle}
                >
                  <option value="rich_orange">Rica (Chamas Laranja/Amarelas)</option>
                  <option value="stoich">Estequiométrica Ideal (14.7:1)</option>
                  <option value="lean_blue">Anti-Lag / Pobre (Chamas Azuis de Plasma)</option>
                </select>
              </label>

              <label style={lblStyle}>
                Sistema de Escapamento
                <select
                  value={tune.exhaustStyle}
                  onChange={(e) => update('exhaustStyle', e.target.value as CarTuneSetup['exhaustStyle'])}
                  style={inputStyle}
                >
                  <option value="oem">Original Silencioso OEM</option>
                  <option value="titanium_race">Titânio Inconel (-12kg)</option>
                  <option value="straight_pipe">Só o Cano Direto (Pops & Bangs)</option>
                  <option value="escapamento_furado">Escapamento Furado Clássico Celta 2003!</option>
                </select>
              </label>
            </div>

            <div style={grid2}>
              <label style={lblStyle}>
                Cilindro de Nitro (N2O): {tune.nitroCapacityKg} kg
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={1}
                  value={tune.nitroCapacityKg}
                  onChange={(e) => update('nitroCapacityKg', Number(e.target.value))}
                />
              </label>
              <label style={lblStyle}>
                Combustível na Largada: {tune.fuelLoadLiters} L (+{Math.round(tune.fuelLoadLiters * 0.75)} kg)
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={tune.fuelLoadLiters}
                  onChange={(e) => update('fuelLoadLiters', Number(e.target.value))}
                />
              </label>
            </div>
          </div>
        )}

        {tab === 'transmissao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={grid2}>
              <label style={lblStyle}>
                Tipo de Transmissão
                <select
                  value={tune.transmission}
                  onChange={(e) => update('transmission', e.target.value as TransmissionType)}
                  style={inputStyle}
                >
                  <option value="manual">Manual H-Pattern + Embreagem</option>
                  <option value="sequential">Sequencial Dog-Box (Clack Mecânico)</option>
                  <option value="dual_clutch">Dupla Embreagem DCT (35ms)</option>
                  <option value="automatic">Automática Conversor de Torque</option>
                  <option value="cvt">CVT Contínua</option>
                </select>
              </label>

              <label style={lblStyle}>
                Quantidade de Marchas: {tune.gearCount} (3 a 8 permitidas!)
                <input
                  type="range"
                  min={3}
                  max={8}
                  value={tune.gearCount}
                  onChange={(e) => {
                    const cnt = Number(e.target.value);
                    const base = [3.5, 2.35, 1.72, 1.34, 1.08, 0.89, 0.76, 0.66].slice(0, cnt);
                    onChangeTune({ ...tune, gearCount: cnt, gearRatios: base });
                  }}
                />
              </label>
            </div>

            <label style={lblStyle}>
              Relação Final do Diferencial (Final Drive): {tune.finalDrive.toFixed(2)}
              <input
                type="range"
                min={2.4}
                max={5.2}
                step={0.05}
                value={tune.finalDrive}
                onChange={(e) => update('finalDrive', Number(e.target.value))}
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {tune.gearRatios.slice(0, tune.gearCount).map((r, i) => (
                <label key={i} style={lblStyle}>
                  {i + 1}ª: {r.toFixed(2)}
                  <input
                    type="range"
                    min={0.55}
                    max={4.2}
                    step={0.05}
                    value={r}
                    onChange={(e) => {
                      const next = [...tune.gearRatios];
                      next[i] = Number(e.target.value);
                      update('gearRatios', next);
                    }}
                  />
                </label>
              ))}
            </div>

            {/* Interactive SVG Gear Speed & Torque Graph */}
            <div style={{ background: '#090d16', borderRadius: 8, padding: 10, border: '1px solid #1e293b' }}>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                GRÁFICO INTERATIVO DE ESCALONAMENTO DE MARCHAS & CURVA DE TORQUE
              </div>
              <svg width="100%" height="110" viewBox="0 0 400 110">
                {tune.gearRatios.slice(0, tune.gearCount).map((ratio, idx) => {
                  const maxSpdForGear = Math.min(390, (stats.maxRpm / (ratio * tune.finalDrive)) * 0.12);
                  const xEnd = Math.min(390, maxSpdForGear);
                  const xStart = idx === 0 ? 10 : Math.min(380, xEnd * 0.62);
                  return (
                    <g key={idx}>
                      <line
                        x1={xStart}
                        y1={95}
                        x2={xEnd}
                        y2={22}
                        stroke="#00f5d4"
                        strokeWidth={2.5}
                      />
                      <text x={xEnd - 10} y={16} fill="#ffbe0b" fontSize="10">
                        {idx + 1}ª
                      </text>
                    </g>
                  );
                })}
                <path
                  d="M 10 85 Q 150 18, 290 30 T 390 65"
                  fill="none"
                  stroke="#ff3b30"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              </svg>
            </div>
          </div>
        )}

        {tab === 'susp_aero' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => onToggleCfd(!cfdVisible)}
              style={{
                padding: '9px 12px',
                borderRadius: 6,
                border: '1px solid #00f5d4',
                background: cfdVisible ? '#00f5d4' : 'rgba(0, 245, 212, 0.12)',
                color: cfdVisible ? '#041014' : '#00f5d4',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {cfdVisible ? '🌬️ OCULTAR LINHAS DE FLUXO CFD EM TEMPO REAL' : '🌬️ ATIVAR TÚNEL DE VENTO CFD 3D AO REDOR DO CARRO'}
            </button>

            <div style={grid2}>
              <label style={lblStyle}>
                Mola Dianteira: {tune.springRateFrontNmm} N/mm
                <input
                  type="range"
                  min={25}
                  max={220}
                  value={tune.springRateFrontNmm}
                  onChange={(e) => update('springRateFrontNmm', Number(e.target.value))}
                />
              </label>
              <label style={lblStyle}>
                Mola Traseira: {tune.springRateRearNmm} N/mm
                <input
                  type="range"
                  min={25}
                  max={220}
                  value={tune.springRateRearNmm}
                  onChange={(e) => update('springRateRearNmm', Number(e.target.value))}
                />
              </label>
            </div>

            <div style={grid2}>
              <label style={lblStyle}>
                Altura da Suspensão: {tune.rideHeightMm} mm (Negativo = Chora Boy!)
                <input
                  type="range"
                  min={-65}
                  max={85}
                  value={tune.rideHeightMm}
                  onChange={(e) => update('rideHeightMm', Number(e.target.value))}
                />
              </label>
              <label style={lblStyle}>
                Cambagem Dianteira: {tune.camberFrontDeg.toFixed(1)}°
                <input
                  type="range"
                  min={-6.5}
                  max={1.0}
                  step={0.1}
                  value={tune.camberFrontDeg}
                  onChange={(e) => update('camberFrontDeg', Number(e.target.value))}
                />
              </label>
            </div>

            <div style={grid2}>
              <label style={lblStyle}>
                Splitter Dianteiro (Ataque): {tune.frontWingDeg}°
                <input
                  type="range"
                  min={0}
                  max={25}
                  value={tune.frontWingDeg}
                  onChange={(e) => update('frontWingDeg', Number(e.target.value))}
                />
              </label>
              <label style={lblStyle}>
                Asa Traseira (Ataque): {tune.rearWingDeg}°
                <input
                  type="range"
                  min={0}
                  max={35}
                  value={tune.rearWingDeg}
                  onChange={(e) => update('rearWingDeg', Number(e.target.value))}
                />
              </label>
            </div>

            <label style={lblStyle}>
              Balanço de Frenagem Dianteiro: {Math.round(tune.brakeBiasFront * 100)}%
              <input
                type="range"
                min={0.45}
                max={0.75}
                step={0.01}
                value={tune.brakeBiasFront}
                onChange={(e) => update('brakeBiasFront', Number(e.target.value))}
              />
            </label>
          </div>
        )}

        {tab === 'visual_rodas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Historical Factory Swatches */}
            <div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>
                CORES HISTÓRICAS DE FÁBRICA ({car.historicalColors.length} VARIAÇÕES)
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {car.historicalColors.map((sw) => (
                  <button
                    key={sw.name}
                    title={sw.name}
                    onClick={() => update('paintColor', sw.hex)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: sw.hex,
                      border: tune.paintColor === sw.hex ? '2px solid #fff' : '1px solid #444',
                      cursor: 'pointer',
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={tune.paintColor}
                  onChange={(e) => update('paintColor', e.target.value)}
                  style={{ width: 36, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
                />
              </div>
            </div>

            <div style={grid2}>
              <label style={lblStyle}>
                Acabamento da Pintura PBR
                <select
                  value={tune.paintFinish}
                  onChange={(e) => update('paintFinish', e.target.value as PaintFinish)}
                  style={inputStyle}
                >
                  <option value="clearcoat_gloss">Verniz Alto Brilho Clearcoat</option>
                  <option value="metallic">Metálica Flocada</option>
                  <option value="matte_glitter">Fosca com Glitter</option>
                  <option value="pearlescent">Perolizada Profunda</option>
                  <option value="chameleon">Camaleão Iridescente</option>
                  <option value="thermochromic">Termocromática (Muda com Calor do Motor!)</option>
                  <option value="glow_dark">Luminescente Brilha no Escuro</option>
                </select>
              </label>

              <label style={lblStyle}>
                Faixas / Camada de Livery
                <select
                  value={tune.liveryStripe}
                  onChange={(e) => update('liveryStripe', e.target.value as CarTuneSetup['liveryStripe'])}
                  style={inputStyle}
                >
                  <option value="none">Pintura Lisa</option>
                  <option value="twin_racing">Faixas Duplas Le Mans</option>
                  <option value="offset_gt">Faixa Assimétrica GT</option>
                  <option value="sponsor_pro">Pintura Equipe Oficial + Numeral</option>
                  <option value="cyber_grid">Malha Holográfica Cyber</option>
                </select>
              </label>
            </div>

            <div style={grid2}>
              <label style={lblStyle}>
                Body Kit
                <select
                  value={tune.bodykit}
                  onChange={(e) => update('bodykit', e.target.value as CarTuneSetup['bodykit'])}
                  style={inputStyle}
                >
                  <option value="stock">Carroceria Original</option>
                  <option value="widebody_rb">Rocket Bunny Rebitado</option>
                  <option value="liberty_walk">Liberty Walk Widebody</option>
                  <option value="mansory_carbon">Forjado em Fibra de Carbono</option>
                  <option value="time_attack_aero">Time Attack Tsukuba Aero</option>
                </select>
              </label>

              <label style={lblStyle}>
                Adesivo de Vidro Traseiro
                <select
                  value={tune.stickerId}
                  onChange={(e) => update('stickerId', e.target.value)}
                  style={inputStyle}
                >
                  {STICKER_LIBRARY.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.badge} {st.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* 500 Wheel Models */}
            <label style={lblStyle}>
              Catálogo de 500 Rodas: {WHEEL_CATALOG[tune.wheelModelIndex].name}
              <input
                type="range"
                min={0}
                max={499}
                value={tune.wheelModelIndex}
                onChange={(e) => update('wheelModelIndex', Number(e.target.value))}
              />
            </label>

            <div style={grid2}>
              <label style={lblStyle}>
                Aro da Roda: {tune.wheelSizeInch}" (13" a 24")
                <input
                  type="range"
                  min={13}
                  max={24}
                  value={tune.wheelSizeInch}
                  onChange={(e) => update('wheelSizeInch', Number(e.target.value))}
                />
              </label>
              <label style={lblStyle}>
                Offset (Tala / Stance): {tune.wheelOffsetMm} mm
                <input
                  type="range"
                  min={-20}
                  max={65}
                  value={tune.wheelOffsetMm}
                  onChange={(e) => update('wheelOffsetMm', Number(e.target.value))}
                />
              </label>
            </div>

            <div style={grid2}>
              <label style={lblStyle}>
                Marca do Pneu
                <select
                  value={tune.tireBrand}
                  onChange={(e) => update('tireBrand', e.target.value as TireBrand)}
                  style={inputStyle}
                >
                  <option value="Pirelli">Pirelli P-Zero Corsa</option>
                  <option value="Michelin">Michelin Pilot Sport Cup 2R</option>
                  <option value="Bridgestone">Bridgestone Potenza RE-71RS</option>
                  <option value="Continental">Continental ExtremeContact</option>
                  <option value="Goodyear">Goodyear Eagle F1 SuperSport</option>
                </select>
              </label>
              <label style={lblStyle}>
                Composto Pacejka
                <select
                  value={tune.tireCompound}
                  onChange={(e) => update('tireCompound', e.target.value as TireCompound)}
                  style={inputStyle}
                >
                  <option value="ultra_soft">Ultra-Soft (Qualifying)</option>
                  <option value="soft">Soft</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard Endurance</option>
                  <option value="wet">Chuva Pesada (Sulcos Profundos)</option>
                  <option value="intermediate">Intermediário</option>
                  <option value="off_road">Off-Road / Terra / Neve</option>
                  <option value="drift">Drift (Fumaça Rosa!)</option>
                </select>
              </label>
            </div>
          </div>
        )}

        {tab === 'som_placa' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={grid2}>
              <label style={lblStyle}>
                Padrão da Placa
                <select
                  value={tune.plateRegion}
                  onChange={(e) => update('plateRegion', e.target.value as PlateRegion)}
                  style={inputStyle}
                >
                  <option value="BR_MERCOSUL">🇧🇷 Brasil Mercosul</option>
                  <option value="JP_TOKYO">🇯🇵 Japão Shinagawa</option>
                  <option value="EU_DE">🇩🇪 União Europeia</option>
                  <option value="US_CA">🇺🇸 Califórnia EUA</option>
                  <option value="GALACTIC">🌌 Federação Galáctica 2099</option>
                </select>
              </label>

              <label style={lblStyle}>
                Texto da Placa
                <input
                  type="text"
                  maxLength={7}
                  value={tune.plateText}
                  onChange={(e) => update('plateText', e.target.value.toUpperCase())}
                  style={inputStyle}
                />
              </label>
            </div>

            <div style={grid2}>
              <label style={lblStyle}>
                Sistema de Som Automotivo Interno
                <select
                  value={tune.subwooferLevel}
                  onChange={(e) => update('subwooferLevel', e.target.value as CarTuneSetup['subwooferLevel'])}
                  style={inputStyle}
                >
                  <option value="stock">Rádio Original AM/FM</option>
                  <option value="street_12in">Caixa Selada 12" (+28kg)</option>
                  <option value="paredao_treme_tudo">PAREDÃO GOL QUADRADO (Treme o Carro Todo! +145kg)</option>
                </select>
              </label>

              <label style={lblStyle}>
                Importar Sua Própria Música (MP3/WAV/OGG)
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) audioEngine.loadCustomMusicFile(file);
                  }}
                  style={{ ...inputStyle, padding: 4 }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={tune.unoRoofLadder}
                  onChange={(e) => update('unoRoofLadder', e.target.checked)}
                />
                🪜 <strong>Instalar Escada da Firma no Teto</strong> (+220 cv de Aerodinâmica Mítica Brasileira!)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={tune.pineAirFreshener}
                  onChange={(e) => update('pineAirFreshener', e.target.checked)}
                />
                🌲 <strong>Cheirinho de Pinho Pendurado no Retrovisor</strong> (Física Pêndulo no Cockpit!)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={tune.underglowEnabled}
                  onChange={(e) => update('underglowEnabled', e.target.checked)}
                />
                💡 <strong>Neon Underglow RGB Sob o Chassi</strong>
                {tune.underglowEnabled && (
                  <input
                    type="color"
                    value={tune.underglowColor}
                    onChange={(e) => update('underglowColor', e.target.value)}
                  />
                )}
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 66,
  right: 18,
  width: 'min(520px, 94vw)',
  background: 'rgba(10, 14, 24, 0.92)',
  backdropFilter: 'blur(14px)',
  border: '1px solid rgba(255, 149, 0, 0.35)',
  borderRadius: 14,
  padding: 16,
  zIndex: 40,
  boxShadow: '0 20px 50px rgba(0,0,0,0.65)',
};

const closeBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.2)',
  color: '#fff',
  padding: '6px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
};

const tabBtnStyle: React.CSSProperties = {
  border: 'none',
  color: '#fff',
  padding: '6px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 700,
};

const lblStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#cbd5e1',
};

const inputStyle: React.CSSProperties = {
  background: '#131a29',
  border: '1px solid #2d3a54',
  color: '#f8fafc',
  padding: '7px 9px',
  borderRadius: 6,
  fontSize: 12,
};

const grid2: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 10,
};
