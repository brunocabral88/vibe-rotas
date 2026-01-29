# Vibe Rotas - Slack Rota Management App

A multi-workspace SaaS Slack app for managing team rotas with automatic rotation scheduling.

## Features

- 🔄 Automatic rotation scheduling using RRULE (Daily, Weekly, Biweekly, Monthly)
- 📱 Manage rotas via Slack Bot Home tab
- 🎨 Customizable Block Kit message templates
- 👥 Multi-workspace support
- 🔔 Scheduled notifications to channels (hourly cron job)
- ⚙️ Full CRUD operations for rota management
- 🔒 Secure request verification (HMAC SHA256 signatures)
- 📊 Assignment tracking and history
- 🔁 Automatic retry logic with exponential backoff
- 📝 Comprehensive logging (file + console)
- 🛠️ Admin endpoints for manual scheduler control

## Tech Stack

- **Backend**: Express.js
- **Database**: MongoDB with Mongoose
- **Slack Integration**: Direct Slack Web API calls with axios
- **Scheduling**: node-cron + RRULE
- **Logging**: Winston (file rotation + console)
- **Containerization**: Docker & Docker Compose

## Prerequisites

- Node.js 18+ 
- MongoDB 7.0+
- Docker & Docker Compose (optional)
- Slack App credentials

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd vibe-rotas
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env` and fill in your Slack app credentials:

```bash
cp .env.example .env
```

Required environment variables:
- `SLACK_CLIENT_ID` - Your Slack app client ID
- `SLACK_CLIENT_SECRET` - Your Slack app client secret
- `SLACK_SIGNING_SECRET` - Your Slack app signing secret
- `MONGODB_URI` - MongoDB connection string
- `ENCRYPTION_KEY` - 32-character key for encrypting tokens

### 4. Set up Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Create a new app or use an existing one
3. Configure OAuth & Permissions with required scopes
4. Enable Socket Mode (recommended) or configure Request URL
5. Subscribe to bot events
6. Install app to your workspace

## Running the Application

### Development Mode

```bash
npm run dev
```

The server will start on `http://localhost:3000` with hot reload enabled.

### Linting

```bash
# Check for linting issues
npm run lint

# Auto-fix linting issues
npm run lint:fix
```
### Production Mode

```bash
npm start
```

### Using Docker Compose

```bash
# Build and start all services
npm run docker:up

# View logs
npm run docker:logs

# Stop services
npm run docker:down
```

Docker Compose will start:
- MongoDB on port 27017
- Express API on port 3000

## Project Structure

```
vibe-rotas/
├── src/
│   ├── index.js              # Express server entry point
│   ├── config/
│   │   ├── database.js       # MongoDB connection
│   │   └── slack.js          # Slack app config
│   ├── models/               # Mongoose models
│   ├── controllers/          # Route controllers
│   ├── services/             # Business logic
│   ├── views/
│   │   └── blocks/           # Block Kit UI templates
│   ├── middleware/           # Express middleware
│   └── utils/                # Utility functions
├── docker-compose.yml        # Docker services config
├── Dockerfile               # Container image
├── .env.example             # Environment variables template
└── package.json             # Dependencies and scripts
```

## API Endpoints

### Public Endpoints
- `GET /` - Landing page with install button
- `GET /health` - Health check endpoint
- `GET /slack/install` - Start OAuth installation flow
- `GET /slack/oauth_redirect` - OAuth callback endpoint

### Slack Endpoints (Verified)
- `POST /slack/events` - Slack events endpoint (HMAC verified)
- `POST /slack/actions` - Interactive components endpoint (HMAC verified)

### Admin Endpoints
- `GET /admin/scheduler/status` - Get scheduler status
- `POST /admin/scheduler/run` - Manually trigger scheduler
- `POST /admin/scheduler/retry` - Retry failed notifications

## Security

The app implements several security best practices:

- **Request Verification**: All Slack requests are verified using HMAC SHA256 signatures
- **Replay Attack Prevention**: Requests older than 5 minutes are rejected
- **Secure Token Storage**: OAuth tokens stored in MongoDB
- **Environment Variables**: Sensitive credentials never committed to source

See [docs/SLACK_VERIFICATION.md](docs/SLACK_VERIFICATION.md) for detailed security information.

## Scheduler

The scheduler runs automatically every hour to check active rotas and send notifications:

- **Schedule**: Every hour on the hour (configurable with cron)
- **Retry Job**: Every 6 hours for failed notifications
- **Assignment Tracking**: All assignments saved to MongoDB
- **Duplicate Prevention**: Won't send multiple notifications for same day
- **Logging**: Comprehensive logs in `logs/` directory

See [docs/SCHEDULER.md](docs/SCHEDULER.md) for complete scheduler documentation.

## Development Roadmap

See [plan.md](plan.md) for the full implementation plan.

## License

ISC
