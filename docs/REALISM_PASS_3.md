# REALISM PASS #3 — MP3 na estrada + fotografia real no pipeline WebGL

Data: 2026-11-10/11 · Branch: `arena/cd585ddd-ronyvolt`

Este documento registra o que foi **feito, medido e verificado** nesta rodada. Ele é
deliberadamente honesto sobre o que ainda não é possível: ver a seção
[O limite declarado](#o-limite-declarado) no final.

---

## 1. O bug: "clico no play e nada acontece"

### Causas reais encontradas (cadeia completa)

| # | Causa | Efeito |
|---|---|---|
| 1 | `CustomMusicPanel` criava `blob:` URLs e as **revogava no cleanup do React** | fechar o modal / trocar de aba / iniciar a corrida matava a URL da música que estava tocando. `ended` avançava para uma URL morta e o som morria na estrada |
| 2 | `React.StrictMode` montava o painel duas vezes | dois conjuntos concorrentes de URLs, metade vazando |
| 3 | `CustomMusicPlayer.play()` retornava sem fazer nada se `attach()` ainda não tivesse rodado | play antes de `audioEngine.init()` = silêncio absoluto |
| 4 | `setStation('custom_usb')` chamava `play()` implicitamente **e** `playTrack(index)` chamava de novo | o primeiro `play()` rejeitava com `AbortError` e a UI voltava para "pausado" enquanto a segunda faixa tocava |
| 5 | `AudioContext` suspenso só era retomado no primeiro gesto global | clicar no play de um controle diferente deixava o contexto mudo; erro engolido por `catch()` vazio |
| 6 | `MiniPlayer.toggle()` chamava o player direto, sem `init()` / `setMusicMode()` | HUD e garagem divergiam |
| 7 | `unlock()` criava o contexto e retornava sem `resume()` | mesmo caso de 5 |
| 8 | `setPaused(false)` tinha early return quando o flag já parecia falso | `masterGain` podia ficar em 0 após pause→garagem→nova corrida: corrida inteira silenciosa |
| 9 | `loadCustomMusicFile()` criava um **segundo** `Audio` em loop na Tuning Cathedral | duas músicas ao mesmo tempo, URL nunca revogada |
| 10 | `stationId` do HUD era estado local, sem poll | `<select>` mostrava rádio antigo enquanto MP3 tocava |
| 11 | `getNowPlaying()` só conhecia a trilha sintetizada | "nada tocando" com MP3 ativo |

### Nova arquitetura

```
customMusicMedia  (dono ÚNICO dos blob: URLs, fora do React)
   ├── IndexedDB (CustomMusicLibrary) ── blobs persistidos no dispositivo
   ├── refresh() serializado → cria só URLs novas, revoga só ids removidos
   ├── setTracks() → customMusicPlayer
   └── subscribe() → CustomMusicPanel / App (sem cleanup destrutivo)

audioEngine (ponto de entrada ÚNICO para qualquer botão de play)
   ├── ensureAudible()   → init + ctx.resume() + restaura masterGain
   ├── playCustom(i)     → setStation('custom_usb', false) + play(i)  (1×)
   ├── customToggle / customNext / customPrevious
   ├── setStation(id, autoplayCustom=true) sem play implícito
   └── resumeFromMenu() só retoma a fonte realmente selecionada

customMusicPlayer (1 HTMLAudioElement)
   ├── funciona mesmo sem attach() (saída direta)
   ├── WebAudio attach idempotente, reconstrói se o contexto mudar
   ├── ignora AbortError obsoleto; publica idle/loading/playing/paused/blocked/error
   ├── pendingPlay → retry só de autoplay bloqueado, nunca de pause explícito
   └── currentTime / duration reais → barra de progresso + seek
```

`App` chama `customMusicMedia.refresh()` no mount (para o MiniPlayer existir mesmo
sem o usuário abrir o modal) e `retryPendingCustomPlayback()` no primeiro gesto.
`VelocityEngine.setPaused(false)` sempre chama `resumeFromMenu()`.

### Validação em navegador real (não é inferência de código)

`tools/browser-check.mjs` abre Chromium 131 headless com SwiftShader, usa o
**file picker de verdade**, clica no **play de verdade**, fecha o modal e clica
em **CORRER**. Resultado medido em `docs/preview/`:

```
afterPlay : playing=true  status=playing  station=custom_usb  mode=mine
inRace    : playing=true  status=playing  station=custom_usb
            currentTime=26.72 s / duration=30 s
            menuPaused=false   photosLoaded=true   photoErrors=[]
+1.5 s    : currentTime=28.31 s      → audioAdvancedOnRoad = true
```

Ou seja: **a música importada continua tocando durante a corrida**. O mesmo
harness gera os screenshots A/B `browser-race-photo.png` e
`browser-race-plain.png`.

---

## 2. Fotografia real dentro do WebGL

Antes desta rodada o jogo era **100% procedural**: asfalto, casca, nuvens,
faróis e reflexos eram ruído desenhado em `<canvas>`. Ruído tem um teto duro:
não tem agregado medido, não tem forma de nuvem real, não tem assinatura de LED
de um carro de verdade.

### Fontes (todas fotografias, nenhuma imagem de stock/IA/render)

| Foto | Uso | Licença |
|---|---|---|
| Asfalto de alta resolução — John Harvey / Wikimedia Commons | albedo, normal, roughness, AO da pista | Domínio público |
| Estrada com guardrail — David Magalhães / Unsplash | céu diurno, faixa de horizonte | Unsplash License |
| GT-R laranja — Jack O'Hara / Unsplash | projetor/DRL real atrás da lente | Unsplash License |
| BMW série 4 — Unsplash | guia de LED da lanterna | Unsplash License |
| Porsche 911 ao entardecer — Jack White / Unsplash | probe de luz quente para IBL | Unsplash License |
| Grama vista de cima — Unsplash | detalhe de solo + normal | Unsplash License |
| Casca de árvore — Photos Public Domain | albedo + relevo de troncos | Domínio público |
| Panorama 360° do céu sul — **ESO/H.H. Heyer** | céu noturno / IBL noturno | **CC BY 4.0** (crédito obrigatório, exibido no jogo) |

Procedência completa: `assets/photos/CREDITS.md` (originais em
`assets/photos/source/`, fora do diretório público). Evitamos
Getty/Adobe/Shutterstock/Freepik/Vecteezy/Alamy e imagens geradas por IA.

### Pipeline offline (`npm run assets:photos`)

`tools/build-photo-assets.mjs` (JavaScript puro, `jpeg-js` + `pngjs`) lê os
originais de `assets/photos/source/` e produz **17 mapas** em
`public/assets/photos/generated/`:

- **mirror quilting** — mosaico 2×2 espelhado para tornar a foto repetível sem
  costura (`RepeatWrapping`);
- **campo de altura** a partir da luminância medida, normalizado por desvio
  padrão;
- **normal map Sobel** com amostragem enrolada (também tileável);
- **roughness** por variância local (aglomerado áspero, ligante betuminoso mais
  liso) e **AO** por oclusão de cavidade;
- **calibração fotométrica**: a foto original do asfalto foi exposta com luz
  dura (luminância média ~0,62) e, usada crua, deixava a pista branca como
  cascalho. O albedo é escalado para o carvão real do betume (~0,16–0,25 sRGB)
  mantendo o contraste **medido** do agregado;
- **pintura desgastada** (faixas de borda, linha âmbar tracejada, dois sulcos
  de borracha) desenhada *sobre* o agregado, seguindo o desgaste do grão;
- **IBL equiretangular** dia/noite: nuvens reais no hemisfério superior,
  asfalto + cores reais de carro/estrada no inferior (é isso que clearcoat,
  cromo e vidro refletem);
- **recortes ópticos** do projetor do GT-R e do LED da BMW;
- 8 **miniaturas** 480×300 para a janela de créditos (460 KB em vez de 9 MB);
- `docs/preview/photographic-assets.png` — folha de contato para inspeção.

### Onde cada mapa entra em runtime (`src/render/PhotographicAssets.ts`)

| Alvo | Antes | Agora |
|---|---|---|
| Pista (`TrackBuilder`) | canvas 512 + normal/roughness de ruído | albedo fotográfico + normal/roughness/AO derivados, `uv1` para AO, `envMapIntensity` amortecido para não pratear o betume |
| Terreno (`Terrain`) | Worley/FBM | grama real (quase cinza, para o vertex color do bioma continuar mandando no matiz) + normal de lâminas reais na placa próxima; rocha procedural no horizonte |
| Faixa de grama (`Scenery`) | ruído | grama real + normal |
| Troncos (`Scenery`, `Vegetation`) | ridged noise | casca real com fissuras e líquen medidos |
| Faróis/lanternas (`CarMeshBuilder`) | fresnel radial / gaussianas | projetor ciano real e guia de LED âmbar/vermelho real atrás da lente de vidro |
| Céu (`RealismRenderer`) | Rayleigh/Mie + FBM | **estrutura de nuvens e estrelas de fotografias reais** misturada ao gradiente físico (o clima continua controlando a cor), mais silhueta fotográfica na faixa do horizonte |
| IBL / PMREM | PMREM do céu analítico | equiretangular fotográfico dia/noite (`EquirectangularReflectionMapping`), convertido para PMREM pelo three.js |

O módulo é **DOM-guarded**: em Vitest e no rasterizador CPU
(`tools/preview/scene.mjs`) ele retorna `null` e tudo cai para o visual
procedural, sem quebrar nenhum harness. Clones de textura compartilham o
`Source` (sem upload duplo) e só marcam `needsUpdate` quando os bytes chegaram —
isso eliminou os avisos `Texture marked for update but no image data found`.

### A/B em tempo real

`Configurações → Gráficos → "Texturas fotográficas reais"`. Cada material
carrega **os dois** conjuntos de mapas em `userData`;
`applyPhotographicMapsToScene()` troca tudo em uma travessia, sem reconstruir
pista, floresta ou carro. O céu e o IBL leem o mesmo flag no próximo
`updateSky()`. O botão **"Ver referências fotográficas e créditos"** abre a
janela com as 8 fotos, autoria, licença e link de origem.

---

## 3. Revisão de bugs — além do áudio

| Achado | Correção |
|---|---|
| `createRoadSurfaceTexture()` usava `repeat=(1,75)` com UV **métrico** (`v = dist/roadWidth`) | 75 tiles por ~12 m = 16 cm/tile; faixas e agregado viravam moiré longitudinal. Corrigido para `(1,1)`, coerente com todos os outros mapas |
| Foto de asfalto crua deixava a pista branca | calibração para betume escuro + `envMapIntensity` 0,62 (e respeitado no loop de pista molhada em `VelocityEngine`) |
| `VelocityEngine` sobrescrevia `envMapIntensity` todo frame | agora escala conforme `roadMaterial.userData.photographic`, inclusive com chuva |
| Normal Sobel de 1024² com força 2,6 | reduzida para 0,85 + `normalScale` 0,32, evitando streak especular |
| Texturas sem filtragem explícita em ângulo rasante | `generateMipmaps`, `LinearMipmapLinearFilter`, `anisotropy=16` |
| Clones de textura marcados para upload antes da imagem existir | upload adiado até o `Source` compartilhar os pixels |
| `CustomMusicPlayer` podia ficar preso em "carregando…" em faixa curta/loop | evento `playing` também publica `status='playing'` |
| Janela de créditos baixava 9 MB de originais para cartões de 240 px | miniaturas de 460 KB |
| `TuningCathedralModal` não aguardava `loadCustomMusicFile()` e não dava feedback | `await` + mensagem de importação/erro |
| MiniPlayer chamava o player direto e mostrava estado local de estação | usa `audioEngine.custom*`, poll de 500 ms, mostra status/erro reais e tempo |
| `SoundtrackModal` marcador "now playing" só conhecia synth | poll mantido; a aba MP3 agora é a dona do estado publicado |
| Painel MP3 com probes de duração sem limite | probes lazy com `loadedmetadata`/`error`, sem revogar URLs (dono é o singleton) |
| `getNowPlaying()` / pause stale / Repeat duplicado | revisados; pause explícito limpa `musicPausedByMenu` e não é ressuscitado |

### Sobre as bandas longitudinais que ainda aparecem no screenshot

Foram investigadas com 5 capturas controladas (mapas ligados/desligados um a
um, sombras ligadas/desligadas, env/clearcoat zerados). Conclusão: **qualquer**
textura de alta frequência aplicada à fita da pista em ângulo rasante produz o
efeito no **SwiftShader** (WebGL por software usado no headless); sem nenhum mapa
a pista fica lisa. Mipmaps e anisotropia explícitos foram adicionados, mas o
rasterizador de software continua exibindo bandas. Isso é uma limitação do
harness de captura, não uma regressão funcional — o mesmo artefato já existia
com a textura procedural antiga (`browser-race-plain.png`). Em GPU dedicada a
filtragem anisotrópica resolve o caso; não foi possível medir GPU real neste
sandbox. Fica registrado aqui para não ser confundido com um defeito novo.

---

## 4. Verificação

```
npm run build                     ✓ tsc -b + vite build
npm test -- --reporter=dot        19 arquivos / 121 testes
npx vite-node tools/soundcheck.ts ✓ 8 faixas, 3351 vozes, 0 eventos atrasados
npm run assets:photos             17 mapas + 8 miniaturas + folha de contato
node tools/browser-check.mjs      MP3 toca na corrida (currentTime avança)
```

Testes novos:
- `src/__tests__/customMusicPlayback.test.ts` (11): play sem `attach`, resume
  de contexto, `AbortError` obsoleto, erro de mídia legível, retry só de
  autoplay, **URLs sobrevivem a refresh/StrictMode**, refresh concorrente sem
  duplicatas, `playCustom` com um único `play()`, restauração do master bus
  após pause stale, pause explícito não ressuscita.
- `src/__tests__/photographicAssets.test.ts` (8): todos os mapas/fontes/
  miniaturas/licenças existem, nenhuma fonte de stock/IA, fallback sem DOM,
  clones com matriz UV independente e `Source` compartilhado, A/B ao vivo.

`tools/browser-check.mjs` usa `window.__velocity` (instalado só em DEV por
`src/dev/runtimeDebug.ts`) para ler **os mesmos** singletons do app — importar
`/src/audio/...` direto cria uma segunda instância por causa do `?t=` do HMR.

---

## O limite declarado

O pedido era "inconfundível com a realidade / equivalente a uma foto". Esta
rodada trouxe **fotografias reais para dentro do pipeline** e removeu vários
tell-tales de CG, mas o benchmark literal continua fora de alcance no runtime
atual, e é melhor dizê-lo que fingir:

- a geometria dos carros e das copas das árvores ainda é **low-poly
  procedural** (copas facetadas são o tell mais visível nos screenshots); não
  há malhas escaneadas nem photogrammetria;
- o IBL é LDR derivado de foto, não um **HDRI diurno calibrado** com
  múltiplas exposições;
- não há path tracing / GI em tempo real, SSR, TAA nem reflexões de para-brisa
  com vidro multicamada em WebGL2;
- não há suspensão visual por roda, spray de água fisicamente correto nem
  câmera com sensor/lente medidos.

O roadmap para chegar mais perto está em `docs/REALISM_PASS_2.md` (P0/P1/P2).
O que esta rodada entrega de verificável é: **o play funciona na estrada**, e
**as superfícies, o céu, os reflexos e as luzes agora vêm de fotografias
reais licenciadas**, com A/B instantâneo e créditos completos.
