.DEFAULT_GOAL := help

# ── Setup ─────────────────────────────────────────────────────────────────────

.PHONY: install
install: ## Install all dependencies (Node + Python)
	pnpm install
	cd apps/extractor && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

.PHONY: env
env: ## Copy .env.example to .env (only if .env doesn't exist)
	@if [ ! -f .env ]; then cp .env.example .env && echo ".env created — fill in your credentials"; else echo ".env already exists, skipping"; fi

.PHONY: setup
setup: env install ## First-time setup (env + install)
	@printf "\nSetup complete. Run 'make dev' to start the web app.\n"

# ── Development ───────────────────────────────────────────────────────────────

.PHONY: dev
dev: ## Start the Next.js dev server
	pnpm dev

.PHONY: extractor
extractor: ## Start the Python extractor sidecar
	cd apps/extractor && .venv/bin/uvicorn main:app --reload --port 8000

.PHONY: dev-all
dev-all: ## Start web + extractor together
	$(MAKE) -j2 dev extractor

# ── Testing ───────────────────────────────────────────────────────────────────

.PHONY: test
test: test-web test-py ## Run all tests (Jest + pytest)

.PHONY: test-web
test-web: ## Run Jest unit/integration tests
	pnpm --filter web test

.PHONY: test-watch
test-watch: ## Run Jest in watch mode
	pnpm --filter web test:watch

.PHONY: test-coverage
test-coverage: ## Run Jest with coverage report
	pnpm --filter web test:coverage

.PHONY: test-e2e
test-e2e: ## Run Playwright end-to-end tests
	pnpm --filter web test:e2e

.PHONY: test-e2e-headed
test-e2e-headed: ## Run Playwright E2E tests with browser visible
	pnpm --filter web test:e2e:headed

.PHONY: test-py
test-py: ## Run Python extractor tests
	cd apps/extractor && .venv/bin/pytest

.PHONY: test-py-v
test-py-v: ## Run Python tests with verbose output
	cd apps/extractor && .venv/bin/pytest -v

# ── Linting & Building ────────────────────────────────────────────────────────

.PHONY: lint
lint: ## Lint the web app
	pnpm --filter web lint

.PHONY: build
build: ## Build the web app for production
	pnpm --filter web build

# ── Docker ────────────────────────────────────────────────────────────────────

.PHONY: up
up: ## Start all services with Docker Compose
	docker-compose up

.PHONY: up-build
up-build: ## Rebuild and start all services
	docker-compose up --build

.PHONY: down
down: ## Stop all Docker services
	docker-compose down

.PHONY: logs
logs: ## Tail Docker Compose logs
	docker-compose logs -f

# ── Supabase (local) ──────────────────────────────────────────────────────────

.PHONY: db-start
db-start: ## Start local Supabase stack
	supabase start

.PHONY: db-stop
db-stop: ## Stop local Supabase stack
	supabase stop

.PHONY: db-reset
db-reset: ## Reset local database and re-run migrations
	supabase db reset

.PHONY: db-migrate
db-migrate: ## Run pending database migrations
	supabase migration up

.PHONY: db-studio
db-studio: ## Open Supabase Studio in browser
	open http://127.0.0.1:54323

.PHONY: db-status
db-status: ## Show local Supabase connection details
	supabase status

# ── Utilities ─────────────────────────────────────────────────────────────────

.PHONY: clean
clean: ## Remove build artifacts and caches
	rm -rf apps/web/.next apps/web/out apps/web/coverage
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

.PHONY: help
help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*##' Makefile | awk 'BEGIN {FS = ":.*##"}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
