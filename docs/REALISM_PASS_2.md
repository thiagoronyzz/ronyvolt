# REALISM PASS #2 — Da silhueta de LEGO para superfície contínua

**Data:** 2026-11-09 · **Branch:** `arena/1c9493de-ronyvolt`
**Benchmark do produtor:** fotografia real de uma SUV em estrada de asfalto, outono, luz dura de sol a 30°.

---

## 0. O diagnóstico curto

O passe anterior (REALISM_AUDIT + primeira implementação) atacou **iluminação, IBL,
física, áudio, IA e pós-processamento**. Isso foi a camada de "cérebro".

O que ficou de fora — e é exatamente o que produz a leitura de "lego" — é a **camada
de forma e de superfície**:

| O que a foto tem | O que a build tinha (v1.1) | Consequência visual |
|---|---|---|
| Superfície de carro **contínua**, gerada por tangência (curvas de nível) | 4 a 6 `BoxGeometry` empilhadas | arestas de 90°, planos chapados, nenhum highlight correndo pela lateral |
| Vidros **envidraçados** que seguem o pilar A/C | 1 cubo de vidro com 6 faces | "aquário" — a cabine é um bloco |
| Caixa de roda **escavada** | nada (pneu atravessa a lataria) | o pneu parece colado do lado de fora |
| Pneu com **banda de rodagem** e flanco curvo | `CylinderGeometry` (barril) | a roda não tem sombra própria nem brilho de borracha |
| Árvore com **copa irregular e galhos** | cone sobre um cilindro | silhueta de pinheiro de desenho animado |
| Guardrail, postes, grama, fios | ausentes | a estrada flutua num plano — nada ancora escala |
| Pintura com **flocos metálicos + casca de laranja** | cor sólida num canvas 512 | reflexo "plástico de brinquedo" |

Forma é 80% da leitura de realismo. Material e luz só funcionam **sobre uma superfície
que existe**.

---

## 1. O que este passe constrói

### `src/world/noise.ts`
Ruído de valor + FBM + worley + RNG determinístico. Base de todas as texturas
procedurais (nenhum asset externo: o projeto é 100% procedural).

### `src/world/proceduralTextures.ts`
Fábrica de mapas PBR com cache por chave. Nada aqui é "textura de jogo" com cara de
adesivo: cada mapa é derivado de um campo de altura e convertido para normal,
roughness e AO:

- **Pintura automotiva** — flocos metálicos (normal map de alta frequência),
  micro-casca de laranja (baixa frequência), mapa de rugosidade que respira
  (±8%), tudo em escala métrica real (floco ≈ 0,35 mm).
- **Fibra de carbono** — tecido 2×2 real (não ruído), com brilho anisotrópico
  aproximado por roughness direcional.
- **Borracha de pneu** — microrrugosidade + banda de rodagem direcional com
  ranhuras, escultura em 4 canais.
- **Couro / tecido / alcântara** — poros irregulares, costura, grão.
- **Asfalto** — agregado com três escalas + ligante betuminoso + trincas finas.
- **Concreto, tijolo, grama, casca de árvore, folhagem** — para o cenário.
- **Vidro sujo** — manchas de calcário, poeira acumulada nos cantos, marcas de
  limpador.

### `src/cars/CarBodyBuilder.ts`
Substitui `BoxGeometry` por **loft de seções transversais** (*cross-section lofting*),
que é como a indústria modela superfície de carro:

1. Cada carro é descrito por uma `CarSilhouette`: comprimento, largura, altura do
   capô, altura do teto, base do para-brisa, recuo do teto, caimento do teto,
   inclinação do vidro traseiro, largura da coluna, altura do soleiro.
2. Uma seção transversal é uma **superelipse** com expoente variável (2.2 → 4.5)
   que achata o topo e arredonda os ombros — exatamente o "ombro" que faz o
   reflexo deslizar pela lateral de um carro real.
3. O loft tem **continuidade C1** entre estações (normais suavizadas), então não
   existe aresta onde a luz quebra.
4. A cabine é um **segundo loft**, mais estreito, com pilar A inclinado e pilar C
   caído. As faces são agrupadas por material: teto = pintura, laterais = vidro,
   frente/trás = para-brisa/vigia, cada uma com sua curva de espessura.
5. **Caixa de roda**: os vértices da lataria dentro do cilindro da roda são
   deslocados para a superfície do arco e marcados como recorte; um liner escuro
   (plástico) fecha o volume, então o pneu entra *dentro* do carro.
6. **Vinco de porta** e **saias** por deslocamento ao longo da normal — painéis
   reais nunca são planos.
7. Retrovisores, maçanetas, antena, escapamento, difusor, aerofólio, faróis com
   lente e refletor, lanternas, placa com moldura — todos em geometria própria.

### `src/cars/WheelBuilder.ts`
Roda = **lathe** (revolução) com perfil real: flanco curvo, ombro, banda de
rodagem com sulcos, talão. Aro com raios extrudados (não caixas), parafusos,
porca central, disco de freio ventilado (dois discos + pinça) e pinça com
pintura. Balanceamento visível: um pequeno peso adesivo.

### `src/world/Scenery.ts`
Dressing ambiental que dá escala e "ancoragem" ao mundo:

- **Árvores de verdade**: tronco com *spline taper* e 3–5 galhos reais, copa
  formada por 7–14 esferoides deformados por ruído (não um cone), com cartões de
  folhagem nas bordas; 3 espécies (latifoliada, conífera, arbusto), instanciadas
  com LOD por distância.
- **Guardrail** metálico: perfil W extrudado ao longo da pista, com postes a cada
  4 m, emendas e suportes.
- **Vegetação rasteira**: tufos de grama em cartões cruzados instanciados,
  coloridos por bioma, excluídos da pista.
- **Postes de energia** com catenária de fios, marcos de quilometragem, placas de
  sinalização com face refletiva, defensas, mourões.
- **Terreno ondulado** com deslocamento por FBM e cor por altura (terra exposta
  em declive, capim em planície).
- **Edifícios** com fachada real: janelas em grid (instanced), soleiras, cornija,
  telhado — não caixas lisas.

---

## 2. Como isso é verificado sem GPU

O ambiente de CI não tem GPU nem Chromium (falta `libnss3`). Foi construído
`tools/preview/raster.mjs`: um rasterizador CPU com z-buffer, sombreamento
Gouraud por normal interpolada, especular por rugosidade e gama. Ele importa os
mesmos módulos TypeScript do jogo (via `vite-node`), coleta os triângulos do
`THREE.Group` real e desenha vistas ortográficas (lateral, frontal, 3/4, topo).

Isso permite **ver** a silhueta que o jogador vê — que é justamente o que o
diagnóstico de "lego" mede. Antes (6 caixas) e depois (superfície loftada) estão
em `docs/preview/`.

---

## 3. Teto honesto

Uma fotografia indistinguível de real exige: BVH + ray tracing de sombras e GI
(ou AO assado em textura em resolução de centímetro), materiais medidos (BRDFs
capturados de carro real), geometria de ~1 M triângulos por carro, e
deslocamento de detalhe sub-milimétrico. Num WebGL2 rodando em GPU de navegador
com 16 ms de orçamento e assets 100% procedurais, esse alvo é inalcançável — e
não é falta de esforço, é falta de orçamento de banda por pixel.

O que **é** alcançável, e é o que este passe entrega: uma imagem em que a
silhueta, a tangência de superfície, a escala e o comportamento da luz obedecem
às mesmas regras de uma foto. O cérebro para de dizer "jogo" nos primeiros
200 ms. Um fotógrafo ainda identifica CG em 2 s por ausência de GI e de sujeira
acumulada real.
