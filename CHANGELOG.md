# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-01-31

### Added
- **Skip Person Feature**
  - Users can skip the currently assigned person when unavailable
  - Skip button appears on all rota notifications (disabled for single-person rotas)
  - Original message updated with strikethrough and skip note
  - New notification sent with next person in rotation
  - Full skip tracking in database (who, when, why)
  - Skip limit enforcement (can't skip everyone)
  - Consecutive skip counting to prevent abuse

## [1.0.] - 2026-01-29

- Initial release with the working app with basic rota CRUD and notification
