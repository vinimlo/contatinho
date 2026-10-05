<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/lockup-dark.svg">
    <img src="docs/brand/lockup.svg" alt="Contatinho" width="360">
  </picture>
</p>

<p align="center">A folha de contato dos seus contatinhos que não te seguem de volta.</p>

<p align="center"><a href="README.md">Read in English</a></p>

<p align="center">
  <img src="docs/screenshots/contatinho.png" alt="O painel do Contatinho nos modos claro e escuro, com perfis inventados" width="720">
</p>

Todo mundo guarda uns contatinhos, por via das dúvidas. O Contatinho é uma extensão do Chrome que abre um painel ao lado do Instagram e mostra quais deles nunca te seguiram de volta. Sem drama. Alguns são museus.

Fiz o Contatinho para a minha própria faxina de seguindo e achei que mais gente ia gostar.

## O que ele faz

Clique em "Ler agora" e o painel percorre as suas listas de seguindo e de seguidores. Quem não te segue aparece numa tira de filme, na ordem em que você seguiu. Clicou num nome, o perfil abre na aba do Instagram e você decide ali mesmo; o número do quadro ganha um risco de lápis, o que ajuda bastante quando a lista é comprida.

Tem conta que você segue de propósito. Perfil grande, a padaria do bairro, aquele amigo que não segue ninguém. Dê uma estrela e ela vai para "Especiais", fora do caminho. Dá para exportar essa lista para um arquivo e importar de volta depois. Contas verificadas ganham uma tira própria, no fim.

## O que ele não faz

Não segue, não deixa de seguir, não curte, não comenta. Essa parte fica com você, na interface do próprio Instagram.

Toda requisição é um GET para uma lista curta e fixa das mesmas rotas que o instagram.com usa quando você abre a sua lista de seguidores. Só um arquivo do código fala com a rede, o `src/lib/ig.ts`, e um teste quebra se outro tentar. As páginas são lidas com pausa de um a dois segundos, e existe uma trava de cinco minutos entre leituras (quinze, se o Instagram pedir um tempo).

Nada sai do seu navegador. Não tem servidor nem analytics: as leituras, as especiais e as miniaturas das fotos ficam no armazenamento local da extensão.

## Instalação

O Contatinho não está na Chrome Web Store (ainda?). Para carregar por conta própria você precisa do Chrome 116 ou mais novo e de Docker ou Node 20+.

1. Clone este repositório.
2. Gere a extensão com `make build` (Docker) ou `npm ci && npm run build` (Node).
3. Abra `chrome://extensions`, ligue o Modo do desenvolvedor, clique em "Carregar sem compactação" e escolha a pasta `dist`.
4. Abra o instagram.com, clique no ícone do Contatinho e depois em "Ler agora".

Para atualizar, puxe as mudanças, gere de novo e clique no botão de recarregar da extensão. Não remova para adicionar de novo: remover a extensão apaga as suas especiais. Se um dia precisar, exporte antes.

## Bom saber

O Instagram não tem API oficial para isso, então o Contatinho usa as rotas internas do site, que podem mudar sem aviso. Se a leitura começar a falhar com erro de formato, abra uma issue.

Conta grande demora um pouco. O Instagram entrega os seguidores de uns 25 em 25, então uma conta com perto de 1.300 seguidores leva dois ou três minutos.

## Desenvolvimento

`make test` roda os testes (Vitest), `make lint` roda o svelte-check, `make build` gera a extensão em `dist/` e `make icons` refaz os ícones PNG a partir dos SVG. Tudo roda num container Docker. As notas de como as peças se encaixam estão no [AGENTS.md](AGENTS.md).

Issues e pull requests são bem-vindos. Só peço que ele continue só lendo.

## Sem vínculo com o Instagram

O Contatinho não tem vínculo, patrocínio nem relação com o Instagram ou a Meta. Instagram é marca registrada da Meta Platforms, Inc. Acesso automatizado ao Instagram pode contrariar os termos de uso, então use o Contatinho na sua própria conta, no seu ritmo e por sua conta e risco.

## Licença

Apache-2.0. Veja o [LICENSE](LICENSE).
