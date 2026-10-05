# AGENTS.md — Contatinho

Notas para quem for mexer no código (pessoas ou agentes). Extensão do Chrome (MV3) que mostra, num painel lateral ao lado do instagram.com, quem você segue e não te segue de volta. Só lê: nunca segue, deixa de seguir, curte ou comenta.

## Como funciona

```
src/content/index.ts    content script no instagram.com: whoami, collect, transmite progress/done/photos
src/lib/ig.ts           único caminho de rede: GET same-origin em rotas fixas e fotos do CDN
src/lib/collect.ts      uma leitura: @ → seguindo (ordenado por data) → seguidores (cursor) → grava → fotos
src/lib/core.ts         puro: diferença, especiais, verificados, busca
src/lib/storage.ts      chrome.storage.local por conta (accounts.<pk>.*) + lastViewerPk
src/lib/thumbs.ts       miniaturas: quem baixar, reaproveitar pelo id da foto, 4 por vez, gravar em lotes
src/content/thumb.ts    reduz a foto para 88 px WebP (OffscreenCanvas) e devolve data URL
src/lib/specialsFile.ts formato de exportação (contatinho/specials v1; importa também segue-de-volta/specials)
src/panel/              Side Panel em Svelte 5 (App, Row, client, messages, pencil)
src/background.ts       só abre o painel no clique do ícone
public/icons/           ícone em SVG e os PNG gerados por make icons
docs/brand/             logo e nome em SVG (claro e escuro)
```

## Comandos

| Comando | O que faz |
|---|---|
| `make install` | `npm ci` no volume Docker `contatinho-node-modules` |
| `make dev` | build e mostra a pasta para carregar no Chrome |
| `make build` | monta `dist/` (Vite + crxjs) |
| `make test` | Vitest |
| `make lint` | svelte-check (tipos e componentes, sem warnings) |
| `make icons` | gera os PNG do ícone a partir de `public/icons/*.svg` (sharp) |

Sem Docker: `npm ci`, depois `npm test`, `npm run check`, `npm run build`.

## Visual

Folha de contato. A lista é uma tira de filme (trilho com perfurações e número do quadro em âmbar) e as marcas são de lápis dermatográfico: círculo em volta de quem é especial, risco no número de quem já foi visto, sublinhado na aba ativa. No escuro vira negativo e o lápis fica branco. Tokens em `src/panel/global.scss`, traços em `src/panel/pencil.ts`, fontes Schibsted Grotesk e Big Shoulders Text embutidas via Fontsource (nada vem do Google em runtime). Verificados ficam no fim de "Não te seguem", numa tira própria com numeração própria.

## Cuidados

- Nunca remova a extensão para atualizar: isso apaga o `chrome.storage.local`, com as especiais. Atualize com `make build` e o botão de recarregar. Exporte antes de trocar a pasta (o id de uma extensão sem empacotar vem do caminho dela).
- O build esvazia e reescreve `dist/` no lugar; não apague a pasta com o Chrome usando a extensão.
- Rotas em uso: `accounts/edit/web_form_data/` (@ da conta), `friendships/{id}/following/?count=200&order=date_followed_latest` e `friendships/{id}/followers/?count=200&search_surface=follow_list_page` (~25 por página, cursor opaco). Não use `users/{id}/info/` nem `web_profile_info`: respondem 429, o segundo com corpo HTML.
- "Seguindo" sem `order=date_followed_latest` pagina por offset numa ordem instável e repete e pula contas.
- Não há rota GET confiável para o total do perfil (o `og:description` da página erra o "seguindo"). A completude vem da paginação: lista só é completa com `has_more: false` no fim, sem página vazia antes nem cursor repetido. O painel mostra os números lidos.
- As rotas são internas e não têm contrato. Quando quebrar, confira no navegador (aba Rede ao abrir a lista de seguidores no seu perfil) e atualize rotas, fixtures (`src/test/fixtures.ts`) e este arquivo juntos.
- Trava de 5 minutos armada no começo da leitura e de novo no fim (15 minutos se terminou em 429), em `accounts.<pk>.cooldownUntil`. Leitura que morre no meio ou segunda aba do Instagram não começam outra leitura.
- 400 com `checkpoint_required`, `challenge_required` ou `login_required` (em `message` ou `error_type`), ou `require_login: true`, é sessão, não rede.
- Fotos: o painel (página `chrome-extension://`) não exibe as imagens do CDN do Instagram, embora a mesma URL carregue numa página comum de outra origem; a causa exata não foi isolada. Por isso as fotos vêm pelo content script: depois de gravar a leitura e liberar o painel, ele baixa (`igImage`: GET, sem cookies, só `*.fbcdn.net` e `*.cdninstagram.com`) as fotos de quem não te segue e das especiais, reduz para 88 px WebP e guarda em `accounts.<pk>.thumbs` (~1 MB para ~250 contas). Leituras seguintes só baixam foto nova ou trocada (`profile_pic_id`). A leitura só termina (`isRunning` falso) depois das fotos. Conta com a silhueta padrão (`has_anonymous_profile_picture`) fica com as iniciais.
- Só `src/lib/ig.ts` faz rede: um teste recusa `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket` e `EventSource` em qualquer outro arquivo de `src/`. Rota nova entra no `ALLOWED_ROUTES` com teste. O `fetch(` que aparece no bundle do painel é o polyfill de modulepreload do Vite.
- O crxjs expõe o content script e o chunk `storage` em `web_accessible_resources` para `www.instagram.com`, com `use_dynamic_url: false` (é como o loader importa o módulo). Trocar para `true` só com teste no Chrome real: há relatos de import dinâmico de content script quebrando com URL dinâmica.
- O Sass roda com `api: 'modern'` (vite e vitest config); sem isso o Vite 5 usa a API legada e a saída vem com aviso de depreciação.
- Fixtures e screenshots usam perfis inventados. Nenhum @ real entra no repositório.
