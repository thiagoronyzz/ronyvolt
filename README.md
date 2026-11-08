# 🔥 VELOCITY UNCHAINED — THE ULTIMATE RACING EXPERIENCE

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
