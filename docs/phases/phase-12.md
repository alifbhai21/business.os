# Phase 12 — Enhancements

## Objective
Implement barcode scanning, FCM push notifications, CSV/Excel export, product variants, PDF/print invoices, and chart of accounts UI.

## Why This Phase Exists
These are important PRD enhancements that improve usability but are not critical to the core MVP flow. They are P1-P2 priority.

## Dependencies
- Phase 04 — Products, Customers & Suppliers
- Phase 08 — Dashboard & Reports

## Tasks

### Mobile

- [ ] Barcode scanning (expo-camera + Google ML Kit)
- [ ] Scan Barcode → Find Product → Add to Cart flow
- [ ] FCM push notifications setup
- [ ] In-app notifications (low stock, customer due, supplier due, sync failures)
- [ ] CSV/Excel export
- [ ] PDF/print invoices
- [ ] Product variants (S/M/L/XL, sizes)
- [ ] Chart of accounts UI
- [ ] Custom expense categories
- [ ] Service business jobs module (P2)

### Backend

- [ ] Notification service (FCM)
- [ ] Export service (CSV)
- [ ] Export service (Excel)
- [ ] Product variant model + API
- [ ] Chart of accounts service + API
- [ ] Notification preference settings

### Testing

- [ ] Barcode scanner tests
- [ ] Notification tests
- [ ] Export tests
- [ ] Product variant tests

## Acceptance Criteria

- [ ] Barcode scanning works
- [ ] Push notifications configured
- [ ] CSV/Excel export works
- [ ] Product variants supported
- [ ] Chart of accounts UI works
- [ ] Tests passing

## Status
- [x] Not started
- [ ] In progress
- [ ] Incomplete — Phase completed when all acceptance criteria pass