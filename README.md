# Next Gen Backend

AI-native backend generator engine that composes blueprint modules into database architectures, runtime manifests, and automation wiring.

## Core Constraints
- Persistence only via NoCodeBackend (NCB)
- Stateless runtime/workers
- No ORM or local database layers
- Layered architecture: core, domain, automation, ai

## Local Development
```bash
npm run dev
```

## Project Docs
- `PROJECT_STATUS.md` for current implementation status
- `CODEX_ARCHITECTURE_DIRECTIVE./` for architecture directives and test PDFs

## Guardrails (Installed)
Guardrail pack files are in repo root:
- `codex_guardrail.ts`
- `codex_guardrail.config.json`
- `pre-commit` (source hook script)

Run guardrails manually:
```bash
npx tsx codex_guardrail.ts --config codex_guardrail.config.json
```

Hook integration:
- Active hooks dir is `.githooks/`
- Guardrail hook is wired at `.githooks/pre-commit`
