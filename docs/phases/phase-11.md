# Phase 11 — Backup & Restore

## Objective
Implement cloud backup strategy, restore on new device, and data export.

## Why This Phase Exists
The PRD requires continuous automatic cloud backup (MongoDB Atlas as backup source), restore on login to a new device, and data export.

## Dependencies
- Phase 10 — Offline SQLite & Sync Engine

## Tasks

### Backend

- [ ] Backup strategy (Atlas as backup source)
- [ ] Restore API (full data push for new device)
- [ ] Data export endpoint (JSON)
- [ ] Data export endpoint (CSV)

### Mobile

- [ ] Restore on login to new device (pull all data)
- [ ] Backup status indicator
- [ ] Data export screen

### Testing

- [ ] Backup test
- [ ] Restore test (new device gets full data)
- [ ] Export test (JSON + CSV)

## Acceptance Criteria

- [ ] New device restore works
- [ ] Data export works
- [ ] Tests passing

## Status
- [x] Not started
- [ ] In progress
- [ ] Incomplete — Phase completed when all acceptance criteria pass