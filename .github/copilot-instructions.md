# Copilot Instructions for vibe-rotas

## Build, lint, and test commands
- Install deps: `npm install`
- Run app (dev): `npm run dev`
- Run app (prod): `npm start`
- Lint full codebase: `npm run lint`
- Auto-fix lint: `npm run lint:fix`
- Lint a single file: `npx eslint src/path/to/file.js`
- Docker stack up/down/logs: `npm run docker:up`, `npm run docker:down`, `npm run docker:logs`

### Testing status in this repo
- `npm test` is currently a placeholder and exits with error (`"Error: no test specified"`).
- There is a targeted verification script for Slack signature logic: `node src/utils/testVerification.js`.

## High-level architecture
- Entry point is `src/index.js` (Express app, route wiring, middleware, DB connection, scheduler start).
- Data layer is MongoDB/Mongoose with three main models:
  - `Workspace`: installed Slack workspaces + tokens
  - `Rota`: rota definitions, schedule metadata, rotation index
  - `RotaAssignment`: daily assignment records, notification/skip tracking
- Slack integration is handled through a custom API wrapper in `src/services/slackClient.js` (direct Web API via axios, workspace token lookup).
- Slack UX flow:
  - `app_home_opened` triggers Home tab rendering (`eventController.publishHomeView` + `views/blocks/homeBlocks.js`)
  - interactive actions + modal submissions are handled in `controllers/slackEventHandler.js`
  - rota CRUD logic is in `controllers/rotaController.js`
- Scheduler flow (`services/schedulerService.js` + `services/assignmentService.js`):
  - cron runs every 15 minutes, retry job every 6 hours
  - checks RRULE/date/time eligibility, prevents duplicates, creates assignment, posts Slack notification, marks notified
  - supports same-day catch-up execution if scheduled time already passed

## Key repository conventions
- **Workspace scoping is mandatory**: always scope reads/writes by Slack team/workspace (`workspaceId` or `teamId`).
- **Slack request verification path**: `/slack/events` and `/slack/actions` use `bodyParser.raw(... verify: verifySlackRequest)` to validate signatures before parsing payloads.
- **Acknowledge Slack quickly**: handlers send HTTP 200 first, then process asynchronously where possible.
- **Time handling convention**:
  - rota notification time is persisted in UTC (`schedule.notificationHour/Minute`, `timezone: 'UTC'` for created/edited rotas)
  - UI converts between user timezone and UTC using `utils/timezoneHelper.js`
  - valid minute values are restricted to `0, 15, 30, 45`
- **Frequency enum**: only `DAILY | WEEKLY | BIWEEKLY | MONTHLY`; RRULE generation is centralized in `utils/rruleHelper.js`.
- **Soft delete for rotas**: deleting a rota sets `isActive = false` (do not hard-delete unless explicitly intended).
- **Skip flow contract**:
  - skip button action IDs use `skip_person_{assignmentId}`
  - skip operation creates a replacement assignment, marks old assignment as skipped, and updates original Slack message.
- **Home UI/action contract**:
  - Home blocks define action/callback IDs (`create_rota_button`, `rota_actions_*`, `create_rota_modal`, `edit_rota_modal`, `delete_rota_modal`)
  - if UI IDs change, update corresponding controller handlers together.
