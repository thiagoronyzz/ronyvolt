# R-volt

> **Limitações atuais:** não há lobby ou matchmaking online; o modo multiplayer é local com IA. O campeonato e o workshop comunitário são protótipos locais, e o painel companion não sincroniza com outro dispositivo. O progresso da carreira e a economia duram apenas durante a sessão; configurações são salvas no navegador.

**Codinome Interno:** *"O Jogo Que Vai Fazer o Re-Volt Parecer um Flash Game de 2004"*  
**Motor Proprietário:** **VELOCITY ENGINE v1.0** (WebGL2 / Three.js PBR + Pacejka Magic Formula + Deformação FEA + Web Audio DSP)

---

## 🚀 Arquitetura Implementada

### 1. VELOCITY ENGINE v1.0 (`src/engine/`)
- **Física de Pneus Pacejka (Magic Formula):** Forças longitudinais e laterais por roda baseadas em *slip angle* e *slip ratio*, composto (`Ultra-Soft` a `Wet` / `Drift`), marca (`Pirelli`, `Michelin`, `Bridgestone`, `Continental`, `Goodyear`), mapa térmico de 3 zonas (`Interior / Centro / Exterior` °C sensível à cambagem!), pressão dinâmica em PSI e desgaste até furo real com faíscas no aro.
- **Centro de Gravidade Dinâmico & Consequências de Swap:** Colocar um V12 Italiano ou W16 Quad-Turbo no **Fiat Uno Mille 2005 (Sem Ar-Condicionado)** altera massa, eleva o CG e dispara alerta estrutural de torção/capotamento caso a suspensão não seja recalibrada.
- **Aerodinâmica CFD em Tempo Real:** Linhas de fluxo 3D interativas na Garagem respondendo ao ângulo do splitter dianteiro e asa traseira (`Cl` downforce, `Cd` drag, vácuo *slipstream* e vento cruzado de até 150 km/h na Patagônia!).
- **Deformação Estrutural FEA & Dano Mecânico:** Deformação progressiva de painéis proporcional à energia cinética do impacto, trincas procedurais no para-brisa em câmera de cockpit, radiador furado (superaquecimento), câmbio avariado, pneu furado puxando direção e vazamento de óleo criando manchas escorregadias reais na pista.
- **Iluminação PBR, Clearcoat, Pintura Termocromática & 47 Climas:** Ciclo solar contínuo `00:00–24:00` com *Golden Hour*, chuva, nevasca, granizo, tempestade Haboob no Saara, pétalas de Sakura, chuva ácida corrosiva em *Cyber City 2099*, relâmpagos e filtro retrô **PSX 1999** em homenagem ao *Re-Volt*.

### 2. Arsenal de 888 Carros Jogáveis (`src/data/carCatalog.ts`)
- **Populares & Lendas de Rua (142):** Liderados pelo **Fiat Uno Mille Fire 2005 (Sem Ar-Condicionado)** com painel rachado, **Cheirinho de Pinho** oscilante no retrovisor, adesivo **"Família Feliz"** e opção da mítica **Escada no Teto**, além de Gol Quadrado 88 (com **Paredão de Som** que faz a lataria inteira tremer no grave!), Celta 2003 (com opção de **Escapamento Furado**!), Peugeot 206, Marea Turbo 20V, Civic Si, Corolla AE86/XEi, Opala, Maverick e mais.
- **Clássicos 1900–1969 (105):** Ford Model T 1908, Mercedes-Benz 300SL Gullwing (com portas asa-de-gaivota animadas na Garagem 3D!), Aston Martin DB5, Ferrari 250 GTO, Fusca 1938–1969, Jaguar E-Type, Porsche 356, Shelby Cobra 427 e mais.
- **Muscle Cars 1970–1989 (85):** Challenger R/T 426 Hemi, Camaro Z28, Boss 429, Barracuda, Trans Am, Buick GNX, Chevelle SS 454, todos com paletas históricas originais.
- **Supercars Modernos (215):** Bugatti Veyron/Chiron/Bolide/Mistral/Tourbillon, McLaren F1/P1/Senna/Speedtail/Solus/W1, **todas as 8 gerações do Porsche 911 GT3 RS**, Ferrari F40 a F80, Lamborghini Diablo a Revuelto, Koenigsegg, Pagani, Rimac Nevera e mais.
- **Hypercars Conceituais & 16 Originais VELOCITY (56):** Vision AVTR, Terzo Millennio, Valkyrie + **16 Hypercars 100% Originais** (incluindo o brasileiro **Solis-Tupã Ybytu X1** forjado no Vale do Aço — Ipatinga/MG!) com Codex completo em `docs/ORIGINAL_HYPERCARS_CODEX.md`.
- **Fórmula, Le Mans, Rally Grupo B, NASCAR & Stock Car Brasil (115):** Tributo Senna MP4/4 & MP4/6, Schumacher F2004, Hamilton W11, Mazda 787B, Lancia Delta S4, Audi Quattro S1, Stock Car Pro Series e mais.
- **Exóticos & Easter Eggs (90):** Foguete Nuclear, Carro Artesanal de Mogno de Gana, Steampunk a Vapor, **Carrinho de Supermercado V8**, **Sofá Chesterfield V8**, **Geladeira Frost-Free Biturbo**, **Cama King-Size Motorizada**, **Tanque 2000cv**, **Ônibus Escolar a Jato**, **Caminhão de Sorvete Demoníaco**, **Trator 2000cv**, **Kombi 911** e **Bicicleta Barra-Forte Motorizada**, todos com enigmas de desbloqueio + Chave Mestre do Produtor.
- **Controle Remoto — Homenagem Direta ao Re-Volt (80):** Toyeca, RC Bandit, Adeon, Cougar, Humma, Zipper e frotas Brushless 6S escala 1:10 com antena flexível simulada!

### 3. 205 Cenários & 14 Modos Jogáveis
- **30 Circuitos Reais** (Interlagos com **fumaça de churrasco no morro**, Nürburgring 20.8km, Mônaco, Spa, Suzuka, Le Mans...), **40 Urbanos** (Neo Tokyo, **São Paulo Underground com buracos reais**, Rio, Londres, Dubai...), **40 Naturais** (Amazônia, Saara, Patagônia 150 km/h, **Escócia com Ovelhas Sagradas**...), **40 Fantasiosos** (Cyber 2099, Estação Orbital 0.35g, Marte 0.38g, Túnel Submarino...), **30 Pistas Macro RC Re-Volt** (**Cozinha**, **Jardim com O GATO GIGANTE**, **Banheiro com rampa de sabonete**, **Quarto**, **Supermercado**...) e **25 Circuitos FIA Originais** com 3 variantes de traçado!
- **Todos os Modos:** Garagem 3D Interativa, Carreira Narrativa (25 capítulos + escolhas morais), Corrida Rápida, Re-Volt Legacy (com Power-ups!), Drift D1, Drag Strip, Contra-Relógio (com Ghost 3D!), Perseguição Policial, Destruição Derby, Entrega Expressa, Acrobacias, Multiplayer c/ Steward Anti-Troll IA, Modo Fotografia Cinematográfico, Editor de Pistas 3D, Telemetria c/ Exportação CSV e Companion App Mobile!

---

## 🔬 REALISM PASS (auditoria + implementação)

O diagnóstico completo está em **[`docs/REALISM_AUDIT.md`](docs/REALISM_AUDIT.md)**. Resumo do que mudou na camada que faz o cérebro acreditar:

| Sistema | Antes | Agora |
|---|---|---|
| Iluminação | `scene.background` = cor chapada, sem IBL | céu analítico (Rayleigh/Mie, disco solar, nuvens, estrelas) + **PMREM/IBL** aplicado em `scene.environment` |
| Sombras | 1 mapa 2048 px / frustum 220 m (~10,7 cm/texel) | 4096 px fitado no carro (~2,2 cm/texel) + texel snapping + contato projetado |
| Pós-processamento | nenhum | HDR half-float 4×MSAA → bloom → DOF (modo foto) → ACES → grade (aberração radial, unsharp, vinheta, grão por luminância) + auto-exposição assimétrica |
| Modo foto | `toDataURL` na resolução da janela | captura **supersampled 2×** com DOF e foco automático na distância do carro |
| Pneus | 1 curva Pacejka sobre slip geométrico | modelo combinado (**elipse de atrito**), relaxação de 0,42 m, sensibilidade à carga, camber thrust, self-aligning torque, térmica, aquaplanagem |
| Física | corpo rígido com yaw prescrito (`tan(steer)×ganho`) | corpo de 4 rodas a **240 Hz fixos**, torque por roda, inércia do motor refletida, atualização semi-implícita, ABS/TC/LSD, atitude emergente das cargas |
| IA | posição = `curve.getPointAt()` (trilho) | **linha de mínima curvatura** + perfil de velocidade em 2 passadas + pure pursuit com erros humanos por piloto |
| Áudio | 3 osciladores em frequências arbitrárias | **ordem de combustão** `rpm/60 × cil/2`, harmônicos por arquitetura, ressonância de escape, intake, convolução por ambiente, superfícies, **Doppler físico** |
| Pista | textura 512 px esticada na volta inteira | UV métrico + normal/roughness procedurais + material físico com clearcoat por clima |

### PASSO 3 — Fotografia real + MP3 na estrada

O terceiro passo está em **[`docs/REALISM_PASS_3.md`](docs/REALISM_PASS_3.md)**. Em resumo: 8 fotografias reais licenciadas (Unsplash / domínio público / ESO CC BY 4.0) viraram 17 mapas PBR derivados — asfalto com agregado medido, normal/roughness/AO por Sobel e variância local, grama, casca, nuvens reais, IBL equiretangular dia/noite, farol e lanterna de carros reais. Há um interruptor A/B em **Configurações → Gráficos** e uma janela de créditos com procedência de cada foto. A cadeia "importar MP3 → fechar modal → correr → play" foi validada em Chromium real.

Verificação: `npm run test` → **19 arquivos / 121 testes** (invariantes físicos, perfil de IA, acústica, Doppler, fila de MP3, pipeline fotográfico) · `npm run build` → limpo · `npx vite-node tools/soundcheck.ts` → sequenciador limpo · `npm run assets:photos` → 17 mapas + 8 miniaturas.

---

## 🎮 Controles Rápidos
- **`W / S` ou `↑ / ↓`**: Acelerar / Frear & Ré
- **`A / D` ou `← / →`**: Direção
- **`Espaço`**: Freio de Mão / Iniciar Drift
- **`Shift`**: Injeção de Nitro (N2O)
- **`E / Q`**: Disparar Power-Up Re-Volt / Trocar Marchas Manualmente
- **`C`**: Alternar entre as 7 Câmeras (`Chase Near`, `Chase Far`, `Cockpit 1ª Pessoa`, `Capô`, `Para-choque`, `Helicóptero TV`, `Suspensão Sub-Chassi`)
- **`R`**: Reposicionar carro no centro do traçado

---

## 🛠️ Desenvolvimento & Testes Automatizados

```bash
npm install
npm run test     # Executa a suíte Vitest validando catálogos, física Pacejka, FEA e malhas 3D
npm run dev      # Inicia o servidor de desenvolvimento em 0.0.0.0:5173
npm run build    # Compilação TypeScript estrita + bundle de produção Vite
```
