# Créditos fotográficos — VELOCITY REALISM PASS #3

As imagens originais ficam em `assets/photos/source/` (entradas do build, **não**
servidas pelo Vite). Todas são **fotografias reais** (não renders, não imagens
geradas por IA). Foram usadas como referência de forma, cor e luz e como fonte
dos mapas PBR derivados em `public/assets/photos/generated/`. Nenhuma delas é
vendida isoladamente: o uso é integrado ao jogo, com recorte, redimensionamento
e derivação de mapas normais/roughness. O navegador só baixa os mapas derivados
e as miniaturas 480×300 de `generated/thumbs/`.

| Arquivo | Fonte | Autoria | Licença |
|---|---|---|---|
| `source/asphalt-public-domain.jpg` | [Wikimedia Commons — Asphalt high resolution texture](https://commons.wikimedia.org/wiki/File:Asphalt_high_resolution_texture.jpg) | John Harvey (via public-domain-image.com) | **Domínio público** (declaração na página do Commons) |
| `source/bark-public-domain.jpg` | [Photos Public Domain — Tree Bark Texture](https://www.photos-public-domain.com/2010/12/31/tree-bark-texture/) | Photos Public Domain | **Domínio público** ("All Photos on this site have been released into the Public Domain") |
| `source/road-guardrail-unsplash.jpg` | [Unsplash — A curved road with a guardrail under a blue sky](https://unsplash.com/photos/a-curved-road-with-a-guardrail-under-a-blue-sky-AiGsgfJQSME) | David Magalhães (@speeddragon35) | [Unsplash License](https://unsplash.com/license) |
| `source/car-gtr-front-unsplash.jpg` | [Unsplash — orange sports car on road](https://unsplash.com/photos/orange-sports-car-on-road-_lD8Ejrx3nA) | Jack O'Hara (@stvrmlord) | Unsplash License |
| `source/car-bmw-rear-unsplash.jpg` | [Unsplash — black car on road during daytime](https://unsplash.com/photos/black-car-on-road-during-daytime-xFgL8xGIGpk) | Unsplash (fotógrafo não identificado na página) | Unsplash License |
| `source/car-porsche-sunset-unsplash.jpg` | [Unsplash — A car driving down a road with a sunset](https://unsplash.com/photos/a-car-driving-down-a-road-with-a-sunset-in-the-background-pkvecakeQjo) | Jack White (@jackwhite2803) | Unsplash License |
| `source/grass-unsplash.jpg` | [Unsplash — topview of grass lawn](https://unsplash.com/photos/topview-of-grass-lawn-QSIq9ncQkzY) | Unsplash (engin akyurt, conforme perfil relacionado) | Unsplash License |
| `source/night-sky-eso.jpg` | [Wikimedia Commons — 360-degree Panorama of the Southern Sky](https://commons.wikimedia.org/wiki/File:360-degree_Panorama_of_the_Southern_Sky.jpg) | **ESO/H.H. Heyer** | **CC BY 4.0** — atribuição obrigatória: *"ESO/H.H. Heyer, CC BY 4.0"*. Usado apenas como faixa de céu noturno; recortado e redimensionado. |

A licença Unsplash permite download, modificação e uso comercial gratuito, sem
autoria obrigatória (atribuição apreciada). O domínio público não impõe
condições. A imagem do ESO é a única que exige crédito visível; ele também
aparece na janela "Referências fotográficas" do jogo e neste arquivo.

## Derivados

`generated/thumbs/` contém miniaturas 480×300 usadas pela janela de créditos do
jogo (para não baixar os originais de vários megabytes só para mostrar um cartão).

`generated/` é produzido por `npm run assets:photos` a partir destas fontes:
`asphalt_albedo.jpg` (asfalto real + faixas), `asphalt_normal.png`,
`asphalt_roughness.png`, `asphalt_clean.jpg`, `ground_detail.jpg`,
`ground_normal.png`, `bark_albedo.jpg`, `bark_normal.png`, `sky_day.jpg`,
`sky_night.jpg`, `horizon_day.jpg`, `car_probe.jpg`, `headlight.jpg`,
`taillight.jpg`. Nenhum derivado contém logotipo de banco de imagens.
