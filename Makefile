# =============================================================================
# Contatinho - Makefile
# =============================================================================
# Extensão do Chrome (MV3, carregada sem empacotar). Tudo roda em container
# node; node_modules fica num volume nomeado, o host só vê o código e o dist/.
# =============================================================================

.DEFAULT_GOAL := help
.PHONY: help install dev build test lint icons

NODE_IMAGE := node:24.13.0-alpine
VOLUME     := contatinho-node-modules
RUN        := docker run --rm --cpus=2 --memory=1g -v "$(CURDIR)":/app -v $(VOLUME):/app/node_modules -w /app $(NODE_IMAGE)
ENSURE     := [ -f node_modules/.package-lock.json ] || npm ci --no-audit --no-fund

## help: Lista os comandos
help:
	@echo ""
	@echo "\033[1mContatinho - Comandos\033[0m"
	@echo ""
	@grep -E '^## [a-zA-Z_-]+:' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ": "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}' | \
		sed 's/## //'
	@echo ""

## install: Instala as dependências no volume (npm ci)
install:
	$(RUN) npm ci --no-audit --no-fund

## dev: Gera a extensão e mostra a pasta para carregar no Chrome
dev: build
	@echo ">>> chrome://extensions > Modo do desenvolvedor > Carregar sem compactação > $(CURDIR)/dist"
	@echo ">>> Atualizar: make build e o botão de recarregar da extensão. Nunca Remover (apaga as especiais)."

## build: Monta a extensão em dist/
build:
	$(RUN) sh -c '$(ENSURE) && npm run build'

## test: Testes (Vitest)
test:
	$(RUN) sh -c '$(ENSURE) && npm test'

## lint: Tipos e componentes (svelte-check)
lint:
	$(RUN) sh -c '$(ENSURE) && npm run check'

## icons: Gera os PNG do ícone a partir de public/icons/*.svg
icons:
	$(RUN) sh -c '$(ENSURE) && npm run icons'
