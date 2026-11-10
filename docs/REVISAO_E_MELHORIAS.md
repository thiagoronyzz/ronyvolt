# REVISÃO COMPLETA — VELOCITY UNCHAINED

Documento de conferência: **o que estava errado**, **o que foi feito** e **como você
pode testar** cada um dos 5 itens pedidos.

- Suíte de testes: **15 arquivos, 97 testes**
- Build de produção: `tsc -b && vite build` → **sem erros**
- Comandos: `npm run dev` (jogo) · `npm test` (verificação automática) · `npm run build`

---

## 1. TELA TORTA / CÂMERA / RESPONSIVO

### O que causava

1. **`camera.rotation.z` escrito depois do `lookAt()`.** No Three.js a ordem de
   Euler é XYZ; escrever `rotation.z` por cima de uma câmera já inclinada (pitch)
   **não** é um roll em torno do eixo de visão. O horizonte entortava por um
   ângulo que variava conforme a curva — e o limite antigo permitia **±2,6°**.
2. **O resize não redimensionava o pós-processamento.** O `handleResize` só
   atualizava `camera.aspect` e o canvas; o `EffectComposer` (bloom, grade,
   vinheta) continuava com o render target do tamanho antigo → imagem
   esticada/apertada depois de qualquer resize ou de trocar o modo PSX.
3. **Sem compensação de FOV em retrato.** Em celular na vertical o carro era
   cortado nas laterais.

### O que foi feito

| Correção | Onde |
|---|---|
| Roll aplicado com `camera.rotateZ()` (roll puro no eixo da visão) e travado em **±0,8°** | `src/engine/CameraRig.ts` + `updateRaceCamera` |
| `ResizeObserver` no container **+** `window.resize` + `orientationchange`, e o composer é redimensionado junto (`realism.setSize`) | `VelocityEngine.handleResize` |
| FOV compensado: mantém o enquadramento horizontal de 16:9, com teto de 96° verticais (anti-fisheye) | `fitVerticalFov()` |
| Câmera “snap” ao trocar de ângulo, iniciar corrida, recuperar o carro ou sair do modo foto | `snapCameraNextFrame` |
| Sacudida de velocidade opcional e desligável | Settings → Gráficos |
| Minimapa/tacho/pedais com classes responsivas e *collision avoidance* (media queries por largura **e** altura) | `src/ui/game.css` |

### Como testar

- **Teste automatizado** `src/__tests__/cameraHorizon.test.ts` (8 testes):
  reconstrói a câmera real de corrida, projeta uma linha do horizonte no mundo e
  **mede a inclinação em graus na tela**. Ele prova que o código antigo
  (`rotation.z`) inclinava o horizonte e que o novo entrega exatamente o roll
  pedido, e que o roll usado no jogo fica **≤ 0,81°**.
- Outro teste percorre 21:9, 16:9, 16:10, 4:3, retrato e quadrado: horizonte
  nivelado e o carro inteiro dentro do quadro em todas as proporções.
- **No jogo**: entre na corrida, gire o celular / redimensione a janela, troque
  de câmera com `C` e bata no guardrail. O horizonte permanece reto.

---

## 2. BUGS GERAIS (FÍSICA, COLISÃO, ESTADO, MEMÓRIA)

### Bugs encontrados e corrigidos

1. **Carro andava sozinho para trás.** O freio-motor era um torque **assinado**
   aplicado mesmo com o carro parado → ~1,7 m/s² de ré permanente. Agora o
   atrito do trem de força zera em repouso (medido: 0,02 km/h parado).
2. **Carro “atravessava a parede” e voltava voando.** `applyImpact()` alterava
   só os amassados cosméticos: o corpo mantinha a velocidade após bater a
   180 km/h e o guardrail precisava teleportá-lo de volta a cada frame. Agora o
   impacto **dissipa energia** (frontal, lateral e traseiro com perdas
   diferentes) e o carro desacelera de verdade.
3. **Estado de pausa conflitante.** Havia três flags (`isPaused`, foto,
   terminado) escritas por caminhos diferentes. Agora há uma função pura
   `canSimulate()` usada por **todos** os caminhos, e `setPaused()` é o único
   ponto de entrada (teclado, botão do HUD, menu de pausa, aba oculta).
4. **Aba oculta continuava simulando** (batia no muro sozinho) — agora pausa
   automaticamente, nunca no modo foto nem depois da bandeirada.
5. **Pausa não silenciava o jogo** — `pauseForMenu()/resumeFromMenu()` cortam
   motor, pneus, vento, trilha e MP3, e retomam exatamente de onde estavam.
6. **Teclas “presas” após alt-tab** — `blur` limpa todas as entradas.
7. **Vazamentos de memória/GPU**: partículas agora vêm de um *pool* (nunca
   `new SphereGeometry()` por fumaça), cena é limpa com `disposeObject3D`,
   `composer`/`renderer`/`ResizeObserver`/listeners são liberados, telemetria
   limitada a 4.500 amostras e gravação de volta a 30.000 pontos.
8. **Recuperar carro (`R`)** agora reposiciona com margem, zera velocidade e
   reenquadra a câmera (não nasce mais dentro do asfalto).
9. **Volume do MP3 atenuava duas vezes** (80% soava 64%) — corrigido.
10. **Áudio mudo no primeiro clique** — `unlock()` no primeiro gesto real e
    retomada da faixa pendente.

### Como testar

| Teste | O que garante |
|---|---|
| `physicsStability.test.ts` (6) | 20 s a pleno acelerador sem NaN, sem voar, sem explodir em 30 fps; derrapagem que **estabiliza**; impacto que **tira** velocidade; reset sem deslizar; **zero creep** parado |
| `trackGeometry.test.ts` (5) | pista fechada, sem auto-sobreposição (não dá para “cortar” por dentro do guardrail), offsets laterais corretos, pista do editor |
| `visuals.test.ts` | regras de pausa/efeitos por superfície |
| `loadResilience.test.ts` (8) | auditoria estática: todo listener removido, composer sincronizado, buffers limitados, pools usados |
| `smokeRender.test.ts` (3) | carros e pistas reais constroem sem erro (evita tela preta) |

---

## 3. REALISMO E DETALHES

### Física

- 240 Hz com substeps fixos, Pacejka combinado, ABS/TC/LSD, transferência de
  peso — preservados.
- **Novo:** dano agora afeta o comportamento (já era), e o impacto dissipa
  energia (item 2.2).
- Suspensão/camber já existentes seguem ativos (roda cede, cambagem ganha).

### Visual

- **Amassados e arranhões reais:** shader injetado no material da pintura
  (`uDentFront/Rear/Left/Right/Hood`, `uScratch`, `uCorrosion`) deforma a normal
  no painel atingido, cria vincos, riscos direcionais e pintura queimada. Antes
  o “dano” era escalar o carro inteiro (parecia um brinquedo amassado).
- Uniforms **por material** (não globais) → bater não amassa os adversários.
- Fumaça/pó/spray/snow por superfície, fumaça de capô danificado, faíscas.
- Motion blur radial leve por velocidade (desligável), bloom (desligável),
  sombras dinâmicas + IBL/PMREM, ciclo dia/noite já existentes.
- **Novo HUD de dano por painel e temperaturas dos 4 pneus** (leitura de corrida).

### Áudio

- Motor com modelo acústico de ordem de ignição, blow-off, escapamento furado,
  pneus por superfície, vento.
- **Novo:** **buzina** (`H`), **torcida + vento ambiente** que crescem com a
  velocidade e **reagem** a batidas e voltas completadas (`cheer()`).
- **Novos buses independentes:** motor, efeitos, trilha do jogo, MP3.

### Como testar

- Bata de frente a ~150 km/h: o carro perde velocidade, o painel dianteiro
  amassa/risca, o HUD de dano acende, o público reage (`cheer`).
- Passe por cima de grama/brita: pó marrom em vez de fumaça branca; na chuva,
  spray.
- Aperte `H`: buzina de dois tons.

---

## 4. MÚSICA MP3 PERSONALIZADA

- **Importação**: `SoundtrackModal` → aba **“Minhas Músicas (MP3)”** com
  arrastar-e-soltar e seletor de arquivos (aceita MP3/M4A/OGG/WAV/FLAC/AAC/OPUS).
- **Biblioteca persistente**: IndexedDB (`CustomMusicLibrary`) com fallback em
  memória; metadados (nome, tamanho, duração).
- **Playlist**: tocar faixa específica, anterior, próxima, **sequencial**,
  **repetir uma** e **aleatória** (`nextIndex`/`prevIndex` puros e testados).
- **Volume próprio**: slider separado, ligado a um `GainNode` exclusivo
  (`customGain`), independente de motor/efeitos/trilha.
- **Dentro da corrida**: mini-player no HUD (`hud-miniplayer`) com
  anterior/tocar-pausar/próxima/volume e o alternador **MP3 ⇄ TRILHA**, sem sair
  do jogo; escondido quando a biblioteca está vazia.
- **Mobile + PC**: `input[type=file]` (nativo em iOS/Android) e drag & drop no
  desktop; layout do mini-player com media queries; volume do MP3 memorizado.
- **Detalhes de robustez**: object URLs revogadas ao remover faixa, retomada
  após bloqueio de autoplay, e o MP3 também alimenta o analisador de graves.

### Como testar

1. Garagem → **Playlist da Viagem** → aba **Minhas Músicas (MP3)** → importe
   2–3 arquivos → dê play.
2. Escolha Sequencial / Repetir uma / Aleatória e confira a troca de faixa.
3. Inicie a corrida: o mini-player aparece no canto inferior esquerdo do HUD;
   pause/pule/abaixe o volume sem parar o carro.
4. `Esc`: a música e o motor silenciam; ao continuar, retomam do mesmo ponto.

---

## 5. INTERFACE / UI-UX

- **Tema definido**: “simulação esportiva noturna” — fundo `#05070c`, painéis
  translúcidos, acento laranja/vermelho (`--vu-accent`), tipografia
  **Archivo** (self-hosted, sem CDN).
- **Design system** em `src/ui/game.css`: tokens, botões, painéis, modais,
  formulários, HUD, mini-player, animações e `prefers-reduced-motion`.
- **Ícones**: `lucide-react` em vez de emoji nos controles (dock da garagem,
  HUD, pausa, configurações, modos de jogo, telas de resultado).
- **Configurações** (`SettingsModal`): Áudio (geral, motor, efeitos, trilha,
  MP3, mudo), Gráficos (qualidade 1x/1.5x/2x, bloom, motion blur, shake),
  Controles (inverter direção + mapa de teclas) e Acessibilidade (daltonismo).
  **Tudo persistido** em `localStorage` e aplicado ao motor na hora.
- **Pausa** (`PauseMenu`): continuar, reiniciar, voltar à garagem.
- **Transições** (`ScreenVeil`): véu com fade + barra de progresso ao trocar
  garagem ⇄ corrida ⇄ resultado; modal com animação de subida; respeito a
  `prefers-reduced-motion`.
- **HUD completo**: posição/volta/cronômetro, **minimapa do traço real da pista**
  com adversários e seta do jogador, velocímetro + marcha + RPM, nitro, dano por
  painel, temperaturas de pneu, rádio e **semáforo de largada**.
- **Responsivo**: media queries para ≤760 px, ≤520 px, altura ≤520 px (paisagem
  de celular) e ultrawide; o mini-player nunca se sobrepõe ao conta-giros.
- **Performance mobile**: em telas touch o render começa em 1x (ajustável).

---

## Testes individuais — resultado atual

```
npm test
 ✓ 15 arquivos, 97 testes — todos passando

npm run build
 ✓ tsc -b sem erros, vite build concluído
```

Novos arquivos de teste desta revisão:

| Arquivo | Cobre |
|---|---|
| `cameraHorizon.test.ts` | tela torta, roll, FOV, 6 proporções de tela |
| `cameraRig.test.ts` | matemática de câmera pura |
| `physicsStability.test.ts` | física: creep, impacto, spin, hitch |
| `trackGeometry.test.ts` | colisão/geometria de 4 pistas + editor |
| `smokeRender.test.ts` | carros/pistas/climas constroem |
| `loadResilience.test.ts` | vazamentos, resize, áudio |
| `components.test.tsx` | settings, pausa, minimapa, CSS |
| `raceHud.test.tsx` | HUD completo renderizado |
| `customMusic.test.ts` | fila de MP3 + biblioteca |
| `disposal.test.ts` | liberação de recursos |
| `visuals.test.ts` | regras de estado/efeitos |
| `soundtrack.test.ts` / `handling.test.ts` / `realism.test.ts` / `velocityEngine.test.ts` | suíte pré-existente |

### Limitação honesta desta entrega

O sandbox onde o código roda **não tem Chromium funcional** (faltam bibliotecas
NSS do sistema e não há permissão de root/apt para instalá-las), então **não foi
possível capturar screenshots do WebGL rodando**. A verificação visual foi
substituída por testes que exercitam o mesmo caminho de código sem GPU
(projeção real com Three.js, render SSR dos componentes React, construção real
das malhas de carro/pista e do CSS). Rode `npm run dev` no seu ambiente para a
conferência visual final — os números de câmera medidos em graus estão nos
testes e não dependem do hardware.
