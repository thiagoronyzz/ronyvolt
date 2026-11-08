# AUDITORIA DE REALISMO — VELOCITY UNCHAINED
### Revisão de direção técnica sobre uma build "quase lá"
**Escopo:** renderização, materiais, iluminação, física veicular, pneus, deformação, clima, áudio, IA, animação, vegetação, partículas, pós-processamento.
**Data:** 2026-11-08 · **Branch:** `arena/cdba529e-ronyvolt` · **Baseline:** `522c239`

---

## 0. Veredito antes do detalhe

Esta build **não tem um problema de tuning. Tem um problema de fundação.**

O código é competente como *arcade estilizado*: catálogos enormes, modos, UI, loops de gameplay. Mas os cinco sistemas que definem "isso é real" — **IBL, integração de forças por pneu, linha de corrida da IA, síntese de áudio por ordem de combustão e pós-processamento fotográfico** — simplesmente não existiam na v1. Eles não estavam mal ajustados; estavam ausentes. É por isso que subir textura, sombra ou bloom não resolvia nada: você estava polindo um motor sem árvore de comando.

Ordem de grandeza do gap, medida no código:

| Sistemas | Estado v1 | O que o olho/ouvido detecta | Gap |
|---|---|---|---|
| `scene.environment` | **inexistente** | verniz, cromado e vidro refletem o vazio → plástico cinza | crítico |
| Céu | `scene.background = Color` | céu chapado, sem sol, sem gradiente de horizonte | crítico |
| Física do corpo | yaw-rate alvo (`tan(steer) × ganho`) | carro não perde traseira; gira igual a 40 e 200 km/h | crítico |
| Pneu | 1 curva Pacejka sobre slip geométrico | freia e curva 100% ao mesmo tempo | crítico |
| IA | posição = `curve.getPointAt()` | carro colado no trilho, sem correção | crítico |
| Áudio | 3 osciladores em frequências arbitrárias | timbre não corresponde a nenhum motor real | crítico |
| Sombras | 1 mapa 2048 px / frustum 220 m | ~10,7 cm por texel: contato de pneu é borrão | alto |
| Textura de pista | 512 px esticados na volta inteira | ~8 m por texel: asfalto é ruído borrado | alto |
| Pós | nenhum (render direto) | sem DOF, bloom, grão, aberração, exposição | alto |
| Clima | `Points` num cubo fixo | chuva não acompanha a câmera; vira "pontinhos" | médio |
| NPCs/vegetação | cones e caixas | silhueta denuncia o procedural | alto |

**Sobre o benchmark:** "uma screenshot do modo fotografia indistinguível de uma foto real" é **inatingível neste runtime e com este pipeline de assets**, e não é uma questão de esforço — é arquitetural. A seção 10 disseca exatamente por quê e qual é o teto honesto. O que dá para atingir, e é o que esta passagem implementa, é um **estilizado convincente**: uma imagem que não faz o cérebro dizer "jogo" em 200 ms, mesmo que um fotógrafo identifique o CG em 2 s.

---

## 1. Como auditei

Não revisei o README — revisei o que o renderer realmente faz. Método:

1. **Leitura do caminho crítico**: `VelocityEngine.startLoop` → `stepRace` → `VehiclePhysicsBody.step` → `renderer.render`; `TrackBuilder.buildTrackWorld`; `CarMeshBuilder.buildCarMesh`; `VelocityAudioEngine.updateFrame`.
2. **Busca por ausências**, que é onde mora o realismo: `grep` por `environment`, `PMREM`, `envMap`, `normalMap`, `roughnessMap`, `AgX`, `toneMapping`, `substep`, `fixed`, `Convolver`, `PeriodicWave`, `relaxation`.
3. **Prova numérica**: simulação headless do corpo rígido (0–100, top speed, g lateral, frenagem) para separar "parece errado" de "está errado".
4. **Teste dos invariantes físicos**: elipse de atrito, sensibilidade à carga, lag de relaxação, Doppler.

Resultado da auditoria numérica da física v1, reconstruída em teste: a aceleração lateral medida pelo G-meter tendia a **~0,0 g em curva sustentada**, porque o código alimentava o medidor e a transferência de carga com a aceleração *cinemática* do referencial do corpo (`Fy/m − r·u`), que é exatamente zero em regime permanente. O carro curvava, mas o G-meter não via nada — e, pior, a transferência de carga que deveria gerar understeer real também não acontecia. Esse é o tipo de bug que ninguém reporta e todo mundo sente.

---

## 2. RENDERIZAÇÃO

### 2.1 Ausência de IBL — o assassino número um

**O que quebra:** todo `MeshPhysicalMaterial` do projeto (pintura com clearcoat, cromado, vidro) avalia o termo especular contra `scene.environment = null`. O resultado físico é que o único especular vem das *duas* luzes analíticas. Um carro com `clearcoat: 1.0, roughness: 0.06` renderiza como plástico fosco cinza, porque não há nada para refletir. O cérebro identifica "pintura automotiva" por **reflexos de ambiente com gradiente** (horizonte escuro embaixo, céu claro em cima, sol como ponto quente). Sem isso, o material mais caro do mundo parece brinquedo.

**Solução:** céu analítico → `PMREMGenerator.fromScene` → `scene.environment`. O PMREM pré-filtra o ambiente numa cadeia de mips por rugosidade, que é o que faz `roughness` significar algo: sem o mip pré-filtrado, mudar rugosidade não muda o reflexo.

**Por que funciona:** o modelo de Cook-Torrance separa difuso (irradiância) de especular (radiação refletida). O split-sum approximation resolve a integral especular com dois termos pré-computados — mapa pré-filtrado e BRDF LUT — e é exatamente o que o PMREM entrega. Sem ele, `metalness = 0.94` (cromado) reflete apenas as duas luzes e vira cinza uniforme; com ele, reflete o céu e o chão, que é o que define metal.

**Implementado:** `src/render/RealismRenderer.ts` — domo de céu + PMREM regenerado quando o sol anda >1,7° (custo amortizado, ~1,5 ms).

### 2.2 Céu chapado

**O que quebra:** `scene.background = skyMix` (uma cor) e `FogExp2` da mesma cor. Um céu de cor única é o sinal de CG mais reconhecível que existe, porque na natureza a luminância **sempre** cresce em direção ao horizonte (mais caminho óptico, mais espalhamento) e o sol cria um lóbulo direcional.

**Solução:** shader com separação Rayleigh/Mie: extinção dependente de comprimento de onda (`vec3(0.72, 1.0, 1.28)`) modulada por profundidade óptica `1/cos(θ)`, lóbulo de Mie forward (`pow(cosθ, 8)`, `pow(cosθ, 64)`), disco solar com *limb darkening*, banda de bruma no horizonte, nuvens FBM e estrelas com twinkle.

**Por que funciona:** é a estrutura do modelo de Preetham/Hosek, simplificada. O ponto perceptivo é o gradiente e o halo — a retina usa a *distribuição* de luminância do céu para estimar hora do dia e tempo, e um gradiente linear simples já é lido como "céu falso".

**Implementado:** `SKY_FRAG` em `RealismRenderer.ts`.

### 2.3 Sombras: resolução efetiva e *shadow acne*

**O que quebra:** mapa de 2048 px com frustum fixo de 220 m = **10,7 cm por texel**. O contato do pneu com o asfalto — a região que decide se o carro está *apoiado* — tem ~25 cm de largura. O resultado é uma mancha mole que "flutua" com o carro. Além disso, o frustum fixo em coordenadas de mundo faz a borda da sombra *tremer* (shadow crawl) quando a câmera translada, porque o texel não está alinhado à grade.

**Solução:** mapa 4096, frustum de 92 m centrado no carro (2,2 cm/texel), **texel snapping** (arredondar o alvo da luz para múltiplos de `2·radius/mapSize`) e `normalBias` proporcional ao texel para eliminar acne sem *peter-panning*.

**Por que funciona:** o erro de perspectiva em shadow mapping escala com o texel em espaço de mundo; encaixar o frustum no objeto de interesse troca cobertura por resolução sem aumentar o custo. O snapping remove o aliasing temporal porque cada texel passa a cobrir a mesma área de mundo em frames consecutivos.

**Implementado:** `RealismRenderer.updateSunShadow`.

### 2.4 Falta de oclusão de contato

**O que quebra:** sem AO, o vão entre pneu e solo recebe a mesma luz que o chão aberto. Objeto "flutuando" é o julgamento mais rápido que o sistema visual faz, e ele é feito em ~100 ms.

**Solução:** decalque radial de contato com dois lóbulos (núcleo duro no patch do pneu + saia longa), plano e preso ao mundo (não ao carro, para não inclinar com o roll).

**Por que funciona:** aproxima a integral de oclusão de hemisfério na região onde ela é mais forte (contato). É um stand-in de GTAO/SSAO específico para carros, e é a solução que a indústria usa quando não quer pagar ray tracing para contato.

**Implementado:** `createContactShadow` + `updateContactShadow` no engine, por carro (jogador e IA).

### 2.5 Texturas de pista com escala errada

**O que quebra:** UV `v = i/segCount`, ou seja **0→1 na volta inteira**. Numa pista de 4 km, um texel de 512 px cobre **8 metros**. O asfalto vira gradiente. Pior: o "groove" de borracha e as linhas são funções da posição no *arquivo*, não da geometria — então a linha central tracejada tem espaçamento proporcional ao comprimento da pista. Pistas curtas e longas ficam com densidades diferentes. Isso é imediatamente visível.

**Solução:** UV métrico (`v = distância percorrida / largura da pista`), `RepeatWrapping` só em T, anisotropia 8, e dois mapas procedurais: **normal map** (3 oitavas de ruído + agregado) e **roughness map** (agregado + groove emborrachado mais liso no meio).

**Por que funciona:** o agregado do asfalto é a textura que o olho usa para estimar velocidade e distância em ângulos rasantes. Escala métrica constante faz o grão "passar" na velocidade correta — e movimento com escala errada é um dos maiores tells de CG.

**Implementado:** `createAsphaltDetailMaps` + UV métrico em `TrackBuilder.ts`.

### 2.6 Reflexos: o que ainda falta e por quê

Asfalto molhado é o caso onde IBL sozinho não basta: a reflexão dominante é **planar** (o carro e o cenário espelhados no chão), não ambiente. A solução correta é SSR (screen-space reflections) com fallback de cubemap, ou um plano de reflexão com `Reflector` para o chão.

**Não implementado nesta passagem** por custo/benefício: SSR em WebGL2 com o número de draw calls deste projeto (~centenas por cena) estoura o orçamento de frame. **O mais próximo viável:** usar `MeshPhysicalMaterial` com clearcoat alto + `envMapIntensity` elevado em piso molhado (feito), e aceitar que o reflexo do carro no chão não aparece. É o item de maior impacto visual restante no clima.

### 2.7 Tonemapping e exposição

**O que quebra:** ACES fixo com `exposure = 1.1` e nenhuma adaptação. À noite o jogo fica preto; em tempestade, lavado. A câmera humana (e qualquer câmera) adapta.

**Solução:** ACES em HDR half-float, com **auto-exposição assimétrica**: constrição rápida (~0,28 s), dilatação lenta (~1,15 s). O override manual do modo foto suspende o loop.

**Por que funciona:** a assimetria é a assinatura da adaptação pupilar; usar uma constante de tempo única é o motivo pelo qual auto-exposição de jogo "nada" e dá enjoo.

**Implementado:** `updateSky` + `setManualExposure`.

---

## 3. MATERIAIS E CARROS

### 3.1 O que quebra
- **Silhueta**: o carro é montado com `BoxGeometry` (capô, cabine, saias) + `CylinderGeometry` para rodas. Não há painéis com espessura, gap de porta, nem curvatura de superfície. A 3 m de distância, a silhueta é a única coisa que importa — e ela é ortogonal.
- **Pintura**: `MeshPhysicalMaterial` com `clearcoat 1.0` é correto na equação, mas falta o **flake** (normal map de partículas metálicas) e a variação de espessura do verniz. Sem flake, metálico e sólido são o mesmo material.
- **Vidro**: sem `transmission`/`ior`, sem reflexo interno, sem sujeira.
- **Interior**: caixas de couro. Sem costura, sem desgaste.

### 3.2 Solução e por que funciona
- **Painéis com espessura e gap**: extrusão do perfil lateral, não caixas. Um gap de 3–4 mm com sombra própria é o que separa "carro" de "bloco".
- **Flake procedural**: normal map de alta frequência com `normalScale` baixo e variação por pixel; o cintilar depende de **anisotropia do BRDF**, não de brilho. Sem isso, metálico parece plástico perolado.
- **Vidro**: `transmission: 1.0, ior: 1.52, thickness`, mais um passe de sujeira (roughness map) nas bordas — para-brisa limpo e perfeito é irreal.

**Limite honesto:** sem malha escaneada e sem texture set medido, o carro nunca vai passar no teste "foto real". O máximo é "carro de jogo AAA de 2015". Ver §10.

---

## 4. FÍSICA VEICULAR

### 4.1 O que quebrava (e é grave)

A v1 integrava **um corpo rígido com yaw prescrito**:

```
targetYawRate = (v / wheelbase) · tan(steer) · dirSign · (handbrake ? 1.48 : 1.12)
angularVelYaw += (targetYawRate − angularVelYaw) · dt · stiffness
```

Cinco consequências, todas visíveis em 10 segundos de jogo:

1. **Não existe sobresterço real.** O carro não pode girar mais que o alvo; a traseira nunca "sai" por falta de grip. Um jogador que tenta provocar o carro descobre que ele é indestrutível em curva — e para de acreditar nele.
2. **A resposta é independente da velocidade de forma errada.** O ganho `×1.12` e a rigidez `10,5` são knobs de gameplay, não física. A 40 km/h o carro rotaciona com a mesma facilidade que a 200.
3. **Frenar e curvar são independentes.** Sem elipse de atrito, o carro faz 100% de cada ao mesmo tempo.
4. **Passo variável.** `dt` vinha do `requestAnimationFrame`, limitado a 40 ms. Um modelo Pacejka é rígido: com passo variável, o comportamento no limite depende do framerate. Isso é a origem literal de "o carro é diferente no meu monitor de 144 Hz".
5. **Transferência de carga não existia** de fato: pitch/roll eram `lerp` de uma aceleração que se cancelava em regime permanente.

### 4.2 O que foi implementado

**`src/engine/TireModel.ts`** — pneu combinado:
- **Similarity method**: slips normalizados pelo pico, magnitude combinada, uma curva Pacejka, projeção de volta no vetor de escorregamento. A elipse de atrito é honrada *por construção* — não há como "burlar" e frear/curvar 100%/100%.
- **Comprimento de relaxação** (0,42 m): a carcaça leva distância para gerar força lateral. É a diferença entre "mola" e "trilho".
- **Sensibilidade à carga** (13% de μ por +100% de Fz): é o que faz transferência de carga gerar understeer — e é o motivo físico de acerto de suspensão existir.
- **Camber thrust**, **pneumatic trail** (self-aligning torque), **degradação térmica assimétrica**, **aquaplanagem** não linear com velocidade.
- **Concessão declarada**: o `tau` de relaxação tem piso de 12 ms e teto de 90 ms por estabilidade do integrador explícito. Isso está documentado no código, não escondido.

**`src/engine/VehicleDynamics.ts`** — corpo rígido de 4 rodas:
- **240 Hz fixos com acumulador** (passo exato, sobra carregada). Não há mais dependência de framerate.
- **Yaw vem do momento das 4 forças de pneu**, com `Izz` derivado da pegada. O carro pode rodar; só um contra-esterço + modulação de acelerador salva. Isso muda o jogo inteiro.
- **Rodas com dinâmica própria**: `I·dω/dt = T_drive − T_freio − Fx·r`. Escorregamento longitudinal emerge; travamento de roda mata a força lateral via elipse.
- **Inércia do motor refletida pela transmissão** (`ENGINE_INERTIA · ratio²`): em 1ª, o drivetrain pesa ~15× a roda. Sem isso, o modelo deixa um carro de 400 cv girar os pneus a 100 rad/s instantaneamente.
- **Atualização semi-implícita da roda**: o ODE de spin tem rigidez ~2500 s⁻¹; explicitamente, ele explode em ±3000 N a cada passo. Esta foi a correção que fez a build voltar a ser jogável — está documentado no código com os números.
- **Corte de combustível + arrasto de over-rev**: limita a roda a uma velocidade finita no corte, e produz o "bap-bap" do limitador.
- **Inércia de motor, lag de turbo assimétrico** (enche devagar, alivia rápido — o "tsss-tah" existe por isso), **freio com fade térmico**, **ABS modulando** (não desligando), **TC**, **diferencial aberto com acoplamento viscoso**.
- **Atitude emergente**: pitch e roll derivam das cargas por roda e da rigidez de mola escolhida, não de um lerp.

**Por que funciona:** o único gerador de yaw é o momento das forças de contato. Isso garante que *toda* sensação de rotação tem uma causa física que o jogador pode aprender e explorar: trail braking rotaciona porque a carga vai para a frente; pisar cedo faz a traseira abrir porque `Fy` traseiro satura antes. É essa **aprendibilidade** que o cérebro lê como "simulação" e não como "animação".

**Prova:** `src/__tests__/realism.test.ts` — elipse de atrito, monotonicidade da carga, lag de relaxação, perda de lateral sob travamento, spin com handbrake, frenagem. Todos passam.

### 4.3 O que ainda falta
- **Suspensão como DOF real** (mola/amortecedor por roda, curso, batente): hoje a carga é quase-estática. Sem isso não há "absorver zebra", nem transferência dinâmica em transientes.
- **Modelo de pneu com carga dinâmica acoplada** (MF-Tyre completo com 40+ coeficientes, medido). O atual é um Pacejka de similaridade simplificado — suficiente para feel, insuficiente para engenharia.
- **Flexão de chassis** e **deformação plástica** de verdade. Hoje `panelDeform` é um escalar que o mesh usa para deslocar vértices. Deformação convincente requer skinning com pesos por região + pré-fratura; sem isso o amassado parece borracha.

---

## 5. ÁUDIO

### 5.1 O que quebrava

`baseHz = 36 + rpmNorm · 185` (V12), `28 + rpmNorm · 145` (V8). Isso não tem relação com nenhum motor. Três osciladores (saw/triangle/sine) com multiplicadores fixos.

O ouvido humano é **extremamente** sensível a relações harmônicas — muito mais que ao timbre absoluto. Errar a fundamental faz o câmbio "não cair no lugar": você troca de marcha e o pitch muda na proporção errada, e o cérebro conclui que o carro não está acelerando de verdade.

Faltava ainda: reverb (túnel = campo), ruído de pneu por superfície, Doppler real, intake, ordem meio (burble de V8 crossplane).

### 5.2 O que foi implementado

`src/audio/EngineAcoustics.ts`:
- **Frequência de combustão** `f = rpm/60 · cilindros/2` (4 tempos). V8 a 3000 rpm = **200 Hz**; inline-4 = 100 Hz; V12 a 6000 = 600 Hz. Testado.
- **PeriodicWave por arquitetura**: 24 harmônicos com queda `1/n^tilt` + ressonância de escape, amplitudes por tipo de motor.
- **Ordem meio** para crossplane: é o burble. Sem ele, V8 = 4 cilindros mais grave.
- **Cadeia de escape**: saturação assimétrica (gera harmônicos pares → "growl") → lowpass ressonante cujo corte acompanha **carga**, não só rpm. É isso que faz o motor "abrir" ao acelerar.
- **Intake** com ruído rosa banda-limitada, **overrun pop** no lift-off.
- **Convolução procedural por ambiente** (aberto/cidade/cânion/túnel), com reflexões iniciais e damping dependente de frequência.
- **Ruído de rolamento por superfície** (asfalto/molhado/zebra/brita/grama/neve) com espectro e Q distintos.
- **Squeal** como oscilação stick-slip: frequência e Q sobem com slip, não "mais ruído".
- **Doppler físico** `f_obs = f_src · c/(c − v)`: a 300 km/h (83 m/s), +32% de pitch na aproximação. Pass-by com pan estéreo e atenuação inversa-quadrada com platô.

**Por que funciona:** um motor é uma sequência de pulsos de pressão. A assinatura perceptual está na **série harmônica da taxa de combustão** e no seu **tilt com carga**. Reproduzir isso corretamente faz o câmbio soar, o que nenhum número de osciladores "afinados no ouvido" consegue.

### 5.3 Limite honesto
Sem **samples reais** (dyno, multi-mic: escape, intake, cabine, externo) e sem **granular synthesis com crossfade por carga**, o áudio sintético fica no máximo "muito bom para sintético". O benchmark "indistinguível de gravação de dyno" exige: banco de amostras por motor × rpm × carga (o padrão da indústria são 8–12 camadas de carga × 16 de rpm), convolução de ambiente medida, e síntese granular com phase-locking. **Isso não é código — é captura.** Nenhum algoritmo substitui a gravação.

---

## 6. IA

### 6.1 O que quebrava

```
b.splineProgress += speed·dt/len
pt = curve.getPointAt(progress)
heading = atan2(tangent.x, tangent.z)   // yaw = tangente, sempre
speed = baseTop · (1 − sharpness·3.1)   // "sharpness" = dot de tangentes a 1,25% à frente
```

Três tells: **yaw nunca desvia da tangente** (nenhuma correção, nenhum slip angle), **todos na mesma linha**, e **frenagem no lugar errado** (heurística local, sem memória, sem antecipação).

### 6.2 O que foi implementado

`src/ai/RacingLine.ts`:
- **Linha de mínima curvatura** por descida coordenada em offsets laterais (o mesmo objetivo dos otimizadores offline). Sai outside-inside-outside sem spline autoral.
- **Perfil de velocidade em duas passadas**: para trás (limite de frenagem `v² = v_next² + 2a·ds`, com wrap para circuito fechado) e para frente (limite de tração/potência `a = min(μg, P/mv)`). Resultado: pontos de frena reais e velocidade de saída de curva real.
- **Downforce acoplado ao limite**: `v² = μ(g + 0.5ρClA·v²/m)·R` resolvido por ponto fixo — carro aerodinâmico ganha velocidade *em curva*, exponencialmente.
- **Piloto pure-pursuit** com lookahead `7 + v·0.42`, curvatura limitada pelo círculo de atrito (bot que pede demais **sobesterça e sai largo**), e imperfeições por piloto: wander lateral, bias de linha, lift ocasional, erro de frenagem — escalados por `consistency`/`skill`.

**Por que funciona:** o cérebro reconhece pilotagem por **correções**. Um carro cujo ângulo de carroceria é exatamente a tangente não está sendo dirigido. Com posição/heading/velocidade próprios, você vê contra-esterço, saída larga, variação de linha entre pilotos — e o replay deixa de ser um trem no trilho.

**Prova:** teste de perfil (curva mais lenta que reta), teste de linha dentro da largura da pista, teste de pilotos diferentes gerando inputs diferentes.

### 6.3 O que ainda falta
- Bots ainda **não usam o mesmo modelo de pneu** do jogador (usam um modelo cinemático limitado por curvatura). Um bot com o `VehicleDynamicsBody` completo seria indistinguível em replay — e é caro (8 corpos × 240 Hz). O caminho profissional é LOD de física: corpo completo a <80 m, cinemático além.
- **Nenhum modelo de ultrapassagem tática real** (hoje há bloqueio por rivalidade, mas não planejamento de lado de freada).
- **Sem aprendizado de linha por piloto** (estilo Drivatar). Hoje a variação é senoidal, não modelada sobre erros que o piloto cometeria.

---

## 7. CLIMA, PARTÍCULAS E SUPERFÍCIE

### 7.1 O que quebrava
Chuva era `THREE.Points` com `size: 0.2`, num cubo de 140 m fixo no espaço. Duas falhas fatais: **gotas têm forma de gota** (alongadas na direção do movimento) e **o volume precisa seguir a câmera** — senão a chuva "acaba" quando você acelera.

### 7.2 O que foi implementado
`LineSegments` com 2600 gotas, cada uma com velocidade própria, comprimento = `v · shutter` (1/30 s), volume que envolve a câmera com wrap. Vento inclina as gotas. Opacidade e cor por tipo (chuva ácida = verde).

**Por que funciona:** o comprimento da streak é o que o obturador mede. Uma gota pontual é informação impossível — daí o cérebro rejeitar. E o wrap elimina a descontinuidade espacial, que é o tell mais óbvio de sistema de partículas mal feito.

### 7.3 O que falta
- **Spray de pneu** (rooster tail) acoplado a `wetness` e slip — o maior sinal visual de chuva em corrida.
- **Ripples de poça** (normal map animado) e spray de contato.
- **Splash no para-brisa** em cockpit (gotas aderindo + limpador).
- **Fumaça de pneu** com iluminação correta (hoje é `Mesh` com material básico; deveria ser um volume com `depthWrite:false` e iluminação por `envMap`).
- **Detritos** com colisão (pedra que sai do pneu e ricocheteia no asfalto).

---

## 8. ANIMAÇÃO, NPCs, VEGETAÇÃO, PÚBLICO

Aqui a build é mais fraca, e é onde o "jogo" aparece mais rápido:

| Item | Estado | Por que quebra | Solução |
|---|---|---|---|
| Árvores | cone + cilindro | silhueta geométrica perfeita, sem variação | instancing de 3–4 variações com LOD, alpha-tested cards, vertex wind |
| Grama | inexistente | piso chapado | instanced blades com vertex shader + density falloff |
| Público | não há | arquibancada vazia = pista abandonada | impostors animados (2D) + 3–5 animações em loop |
| Bandeiras/marcas | caixas rígidas | nada reage ao vento | cloth CPU em 8×8 por bandeira, ou vertex shader |
| Destrutíveis | somem | não há resposta | fragmentos com física + decal de sujeira |
| Câmera | lerp simples | "câmera de jogo" | cam spring-damper, look-ahead por velocidade, shake por impacto, FOV dinâmico |

O item mais barato e de maior impacto é a **câmera**: shake sutil por textura de pista, *look-ahead* proporcional à velocidade e resposta amortecida (spring-damper de 2ª ordem, não lerp) mudam a percepção de velocidade mais que qualquer shader.

---

## 9. PÓS-PROCESSAMENTO E MODO FOTO

### 9.1 O que quebrava
`renderer.render()` direto na tela + `toDataURL`. Sem DOF (toda foto real tem), sem bloom em HDR, sem grão, sem aberração, sem vinheta, sem supersampling. Uma "foto" com tudo em foco, bordas serrilhadas e sem rolloff de alto é assinatura de render.

### 9.2 O que foi implementado
`src/render/RealismRenderer.ts`:
- **Render target half-float com 4× MSAA** — bloom e tonemap precisam ver valores > 1,0.
- **Bloom restrito** (threshold 0,86, força 0,34): só sol, faróis e lanterna. Bloom de jogo é tipicamente 3–4× forte demais e come a imagem.
- **DOF (BokehPass) só no modo foto**, foco na distância da câmera ao carro.
- **Grade pass**: aberração cromática radial (cresce com `r²` — como lente real), **unsharp mask** de 4 taps (micro-contraste), vinheta, **grão dependente de luminância** (sombra ruidosa, alto limpo — grão uniforme parece compressão de vídeo), dessaturação de altas luzes, lift.
- **Captura supersampled 2×** com restauração de estado.

**Por que funciona:** cada item corresponde a um artefato óptico real. O cérebro usa **rolloff de alto** (filme/sensor não satura em cor), **profundidade de campo** (foco seletivo) e **ruído de sensor** como evidência de "isto foi capturado". São os marcadores de autenticidade fotográfica — mais do que qualquer quantidade de polígonos.

---

## 10. O BENCHMARK É INATINGÍVEL? SIM. AQUI ESTÁ POR QUÊ.

"Uma screenshot do modo foto indistinguível de uma foto real para uma pessoa comum."

Isso exige simultaneamente:

1. **Geometria de grau escaneado.** Um carro real tem painéis com 2–4 mm de gap, raio de curvatura contínuo, curvas de superfície complexas (blend surfaces). O projeto monta carros com `BoxGeometry`. Nenhum shader conserta silhueta ortogonal — o sistema visual identifica objetos pela silhueta antes de qualquer outra coisa.
2. **BRDFs medidos + texture sets PBR.** Pintura automotiva real = base metálica + flake orientado + verniz com espessura variável + contaminantes. Sem scans (albedo/normal/roughness 4K por material) e sem um shader de flake anisótropo, o material fica em "plástico premium", no melhor caso.
3. **GI/reflexos de mundo.** Foto real tem luz indireta de tudo. Este runtime tem IBL + uma directional + hemisphere + shadow map. Não há SSGI, não há SSR, não há light leaks corretos. O carro não reflete o carro ao lado.
4. **Ruído de sensor e óptica física.** Já implementado de forma aproximada; o teto aqui é ok.
5. **Escala de cena e densidade.** Uma rua real tem centenas de objetos com variação. Esta build tem dezenas de caixas.

**Conclusão dura:** com este pipeline de assets e este runtime (WebGL2/Three.js, sem deferred, sem TAA/velocity buffer, sem RT), o teto é **"imagem estilizada de alta qualidade"**, não fotografia. Você reconhece instantaneamente que é CG — mas para de reconhecer que é *este* jogo.

**O mais próximo viável hoje**, em ordem de retorno:

1. Substituir o pipeline de carros por **1–3 malhas escaneadas/compradas** com texture set PBR 4K (muda mais que 50 shaders).
2. **SSR em piso molhado** ou planar reflection no asfalto (o maior ganho restante de cena).
3. **TAA com velocity buffer** (resolve serrilhado e shimmer em movimento; hoje o MSAA só resolve parado).
4. **Vegetação instanced** com wind e LOD.
5. **Captura em 4K supersampled** e DOF com 32 samples (já preparado, sobe qualidade do still).

Com esses cinco, o modo foto chega a "screenshot de jogo AAA de 2016". Indistinguível de foto real: **não**, e é importante dizer isso em vez de prometer.

---

## 11. O QUE FOI ENTREGUE NESTA PASSAGEM

| Arquivo | Conteúdo | Impacto |
|---|---|---|
| `src/engine/TireModel.ts` **(novo, ~370 linhas)** | Pacejka combinado, relaxação, sensibilidade à carga, camber, trail, térmica, aquaplanagem | feel de limite; elipse de atrito |
| `src/engine/VehicleDynamics.ts` **(novo, ~700 linhas)** | corpo 4 rodas 240 Hz, torque por roda, inércia refletida, semi-implícito, ABS/TC/LSD, atitude emergente | **o maior ganho de "sim"** |
| `src/render/RealismRenderer.ts` **(novo, ~600 linhas)** | céu físico, PMREM/IBL, sombra fitada + snapping, contact shadow, HDR + bloom + DOF + grade, captura 2×, chuva em streaks | **o maior ganho visual** |
| `src/ai/RacingLine.ts` **(novo, ~420 linhas)** | linha de mínima curvatura, perfil 2 passadas, pure pursuit com erros humanos | IA deixa de ser trilho |
| `src/audio/EngineAcoustics.ts` **(novo, ~560 linhas)** | ordem de combustão, harmônicos, escape/ressonância, IR por ambiente, superfícies, Doppler | timbre passa a ser do motor |
| `src/tracks/TrackBuilder.ts` | UV métrico, normal/roughness procedurais, material físico wet-ready | asfalto deixa de ser borrão |
| `src/engine/VelocityEngine.ts` | integração de todos os sistemas, sombra dinâmica, contato, clima, foto 2× | — |
| `src/audio/VelocityAudioEngine.ts` | modelo acústico no lugar do banco de 3 osciladores | — |
| `src/__tests__/realism.test.ts` **(novo, 22 testes)** | invariantes físicos, perfil de IA, acústica, Doppler | prova, não promessa |

Verificação: `npx tsc -b` limpo · `npx vitest run` **22/22** · `npm run build` ok.

---

## 12. ROADMAP PRIORIZADO

### P0 — o que ainda se vê/ouve como "jogo" (próximas 2 semanas)
1. **Suspensão com DOF real** por roda (mola/amortecedor/batente) → absorve zebra, dá transferência dinâmica.
2. **Spray de pneu + ripples de poça** → chuva deixa de ser overlay.
3. **Câmera spring-damper + shake por superfície** → percepção de velocidade.
4. **Bots com física completa a <80 m** (LOD) → replay indistinguível.
5. **Vegetação instanced** + vento → cenário deixa de ser maquete.

### P1 — qualidade de imagem (2–5 semanas)
6. **TAA** (velocity buffer) — resolve shimmer.
7. **SSR/planar reflection** no asfalto molhado.
8. **Texture set PBR 4K** para 3 carros-herói.
9. **Malha escaneada** para esses 3 carros.
10. **Deformação por skinning** com pré-fratura (não deslocamento escalar).

### P2 — o que separa "AAA" de "referência" (2–3 meses)
11. **Banco de amostras de motor** (8 cargas × 16 rpm × 6 motores) + granular.
12. **GI em tempo real** (SSGI ou DDGI) — precisa de pipeline deferred.
13. **Público impostor animado** e bandeiras com cloth.
14. **Modo foto com bracketing/RAW** e LUTs de filme reais.

---

## 13. COMO PROVAR QUE MELHOROU (não "achismo")

1. **Teste A/B cego**: 20 pessoas, 10 screenshots (5 jogo / 5 foto real), medir tempo de decisão e taxa de acerto. Meta realista: <60% de acerto em <1,5 s.
2. **Teste de áudio**: A/B de dyno real vs. sintético, mesmo motor, mesmo rpm — meta: identificação correta <65%.
3. **Replay da IA**: exibir volta de bot e volta humana sem HUD; pedir para apontar qual é qual. Meta: ~50% (indistinguível).
4. **Telemetria**: comparar 0–100, top speed e g lateral contra dados publicados do carro real; tolerância ±8%.
5. **Frame time**: orçamento 16,6 ms a 1080p. Medir o custo de cada passe (PMREM, bloom, DOF, grade) — o modo foto pode custar 100 ms; o gameplay não.

---

## 14. Fechamento

O que estava faltando não era talento nem conteúdo: era **a camada que faz o cérebro acreditar**. IBL, forças por pneu, ordem de combustão, linha de corrida e resposta de câmera. Sem elas, mais 888 carros só produzem 888 maneiras de parecer um jogo.

O que foi entregue nesta passagem move a build de "arcade com verniz" para "simulação estilizada coerente". O próximo salto não é de shader — é de **asset** (malha e textura medida) e de **orçamento de frame** (TAA, SSR, física LOD). E o benchmark "foto indistinguível de real" continua fora de alcance por razões que nenhum código resolve sozinho, o que é exatamente o tipo de coisa que um diretor técnico precisa ouvir antes de prometer a data.
