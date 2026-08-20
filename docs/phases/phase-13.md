# Phase 13 — Testing, CI/CD & Deployment

## Objective
Establish comprehensive automated testing, CI/CD pipeline, and deployment to staging/production.

## Why This Phase Exists
The PRD requires `npm ci`, typecheck, lint, test, and `npm audit --audit-level=high` on every PR. Zero high/critical vulnerabilities before every release.

## Dependencies
- All phases (testing is integrated from Phase 02 onward)
- Deployment after Phase 05 at minimum

## Tasks

### Testing

- [ ] API test suite (all endpoints)
- [ ] Integration test suite (auth → business → products → sales → reports)
- [ ] Unit test suite (services, utils, validation)
- [ ] Database test suite (models, indexes, transactions)
- [ ] Mobile UI tests (where appropriate)
- [ ] Offline tests (Phase 10)
- [ ] Sync tests (Phase 10)
- [ ] Security tests (rate limit, validation, RBAC)
- [ ] Performance tests (p95 < 500ms core reads)
- [ ] Property-based journal balance test

### CI/CD

- [ ] GitHub Actions workflow: npm ci, typecheck, lint, test
- [ ] `npm audit --audit-level=high` gate
- [ ] Dependabot configuration
- [ ] Staging environment
- [ ] Production environment
- [ ] EAS Build for Android

### Deployment

- [ ] MongoDB Atlas cluster configuration
- [ ] IP allowlist + restricted DB user
- [ ] Server deployment (Render/Railway/Vercel)
- [ ] HTTPS enforcement
- [ ] Android APK build (EAS)
- [ ] Google Play Store setup (sideloading allowed for pilot)

## Acceptance Criteria

- [ ] All tests passing in CI
- [ ] `npm audit` clean (zero high/critical)
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Deployed to staging
- [ ] Deployed to production
- [ ] Android APK builds and installs

## Testing
Every PR runs: `npm ci && npm run typecheck && npm run lint && npm test && npm audit --audit-level=high`

## Status
- [x] Not started
- [ ] In progress
- [ ] Incomplete — Phase completed when all acceptance criteria pass