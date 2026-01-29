# Scheduler Implementation

This document explains the automated scheduler that executes rota assignments.

## Overview

The scheduler runs as a background job using node-cron, checking active rotas every hour and sending notifications when scheduled. It includes retry logic, comprehensive logging, and assignment tracking.

## Architecture

```
┌──────────────────┐
│   Cron Trigger   │  (Every hour)
└────────┬─────────┘
         │
         ▼
┌──────────────────────────┐
│  Scheduler Service       │
│  - Get active rotas      │
│  - Check RRULE schedule  │
│  - Process each rota     │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│  Assignment Service      │
│  - Get next person       │
│  - Create assignment     │
│  - Render message        │
│  - Send to channel       │
│  - Mark as notified      │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│  MongoDB                 │
│  - RotaAssignment saved  │
└──────────────────────────┘
```

## Components

### 1. Scheduler Service (`schedulerService.js`)

**Main Functions:**
- `startScheduler()` - Initialize cron jobs
- `stopScheduler()` - Stop all jobs
- `processAllRotas()` - Process all active rotas
- `retryFailedNotifications()` - Retry failed sends

**Cron Schedule:**
- Main job: Every 15 minutes (`*/15 * * * *`) - runs at 0, 15, 30, 45 minutes past each hour
- Retry job: Every 6 hours (`0 */6 * * *`)

**Execution Flow:**

```javascript
1. Get all active rotas from database
2. For each rota:
   a. Check if scheduled for today (RRULE)
   b. Check if already assigned today (skip if yes)
   c. Get next person in rotation
   d. Create assignment record
   e. Send notification to channel
   f. Mark assignment as notified
3. Log results (processed, skipped, failed)
```

### 2. Assignment Service (`assignmentService.js`)

**Functions:**
- `createAssignment()` - Create DB record
- `markAsNotified()` - Update after successful send
- `sendNotificationWithRetry()` - Send with retry logic
- `renderMessageTemplate()` - Replace placeholders
- `assignmentExistsForToday()` - Check for duplicates
- `getUnnotifiedAssignments()` - Get failed notifications

**Template Rendering:**

Replaces placeholders in Block Kit templates:
- `{userId}` → Actual Slack user ID (e.g., `U123456`)
- `{rotaName}` → Rota name (e.g., `Weekly Support`)

Example:
```javascript
// Template
{
  text: "Today's {rotaName} assignment: <@{userId}>"
}

// Rendered
{
  text: "Today's Weekly Support assignment: <@U123456>"
}
```

### 3. Logger (`logger.js`)

**Features:**
- File logging (combined.log, error.log, scheduler.log)
- Console logging (development only)
- Log rotation (5MB max, 5 files)
- Structured JSON logging
- Component-specific loggers

**Log Levels:**
- `error` - Errors and exceptions
- `warn` - Warnings and issues
- `info` - General information
- `debug` - Detailed debugging

## Scheduling Logic

### Time-Based Scheduling with Catch-Up

The scheduler evaluates conditions before processing a rota:

1. **Date Matching**: Is today a scheduled occurrence according to the RRULE?
2. **Time Check**: Has the notification time passed today?
3. **Duplicate Prevention**: Has this rota already been executed today?

If the date matches, the time has passed, and no assignment exists yet, the rota will execute. This enables **catch-up for missed executions** within the same day.

### RRULE and Time Evaluation

```javascript
function shouldExecuteToday(rota) {
  // Step 1: Check if date matches (RRULE)
  const nextOccurrence = getNextOccurrence(rota.schedule.rrule);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const occurrenceDate = new Date(nextOccurrence);
  occurrenceDate.setHours(0, 0, 0, 0);
  
  const dateMatches = occurrenceDate.equals(today);
  
  if (!dateMatches) return false;
  
  // Step 2: Check if notification time has passed
  const rotaTz = rota.schedule.timezone || 'UTC';
  const currentHour = getCurrentHourInTimezone(new Date(), rotaTz);
  const currentMinute = getCurrentMinuteInTimezone(new Date(), rotaTz);
  const notificationHour = rota.schedule.notificationHour || 10;
  const notificationMinute = rota.schedule.notificationMinute || 0;
  
  // Calculate if time has passed
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const notificationTimeInMinutes = notificationHour * 60 + notificationMinute;
  const timeHasPassed = currentTimeInMinutes >= notificationTimeInMinutes;
  
  // Grace period: Execute if time has passed (catch-up)
  return timeHasPassed;
}
```

### Catch-Up Logic

**What is catch-up?**
If a rota was scheduled for 10:00 AM but wasn't executed (due to downtime, errors, etc.), the scheduler will automatically execute it when it runs later in the day.

**How it works:**
- Scheduler runs every 15 minutes
- Checks if today is a scheduled day (RRULE)
- Checks if notification time has passed
- Checks if assignment already exists (prevents duplicates)
- If all conditions met, executes immediately

**Grace Period:** Until midnight (same day only)

**Example:**
```
Rota scheduled for: 10:00 AM
Current time: 3:00 PM (same day)
Assignment exists: No

Result: ✅ Execute immediately (catch-up)

Rota scheduled for: 10:00 AM (yesterday)
Current time: 9:00 AM (today)

Result: ❌ Don't execute (different day, will run at 10 AM today)
```

### Timezone Handling

Each rota can specify a timezone (e.g., `America/New_York`, `Europe/London`, `Asia/Tokyo`). The scheduler:

1. Runs every 15 minutes (at :00, :15, :30, :45 past each hour)
2. For each rota, converts current UTC time to the rota's timezone
3. Checks if notification time has passed in that timezone
4. Executes if time has passed and no assignment exists yet (catch-up enabled)

**Example:**

```
Current UTC time: 15:30 (3:30 PM)

Rota A:
  - Timezone: America/New_York (UTC-5)
  - Notification time: 10:30
  - Current time in EST: 10:30 ✅ EXACT MATCH → Process immediately
  
Rota B:
  - Timezone: Europe/London (UTC+0)
  - Notification time: 10:30
  - Current time in GMT: 15:30 ✅ CATCH-UP → Process (time has passed, no assignment yet)
  
Rota C:
  - Timezone: America/New_York (UTC-5)
  - Notification time: 16:00
  - Current time in EST: 10:30 ❌ SKIP → Wait (time hasn't passed yet)
  
Rota D:
  - Timezone: Europe/London (UTC+0)
  - Notification time: 10:30
  - Current time in GMT: 15:30
  - Assignment exists: Yes
  - Result: ❌ SKIP → Already executed today
```

### Notification Time Selection

Users can select a notification time when creating or editing rotas:

- **Hour**: 0-23 in 24-hour format
- **Minute**: 0, 15, 30, or 45 (15-minute intervals)
- **Default**: 10:00 (10 AM)
- **Format**: "10:30 (10:30 AM)", "14:45 (2:45 PM)"
- **Timezone-aware**: Time is interpreted in the rota's configured timezone
- **DST-safe**: JavaScript's Intl.DateTimeFormat handles DST transitions automatically
- **Catch-up enabled**: Missed executions run automatically within the same day

### Examples

**Scheduling Examples:**

| Frequency | RRULE | Notification Time | Timezone | When Executes | Catch-Up |
|-----------|-------|-------------------|----------|---------------|----------|
| Daily | `FREQ=DAILY` | 9:00 | America/New_York | Every day at 9:00 AM EST | Until midnight same day |
| Weekly | `FREQ=WEEKLY` | 10:30 | Europe/London | Same day each week at 10:30 AM GMT | Until midnight same day |
| Biweekly | `FREQ=WEEKLY;INTERVAL=2` | 14:15 | UTC | Every 2 weeks at 2:15 PM UTC | Until midnight same day |
| Monthly | `FREQ=MONTHLY` | 8:45 | Asia/Tokyo | Same date each month at 8:45 AM JST | Until midnight same day |

**Catch-Up Examples:**

| Scheduled Time | Current Time | Assignment Exists | Result |
|----------------|--------------|-------------------|--------|
| 10:00 AM | 10:00 AM | No | ✅ Execute (exact match) |
| 10:00 AM | 10:15 AM | No | ✅ Execute (catch-up) |
| 10:00 AM | 3:00 PM | No | ✅ Execute (catch-up) |
| 10:00 AM | 11:45 PM | No | ✅ Execute (catch-up) |
| 10:00 AM | 3:00 PM | Yes | ❌ Skip (already executed) |
| 10:00 AM | 9:45 AM | No | ❌ Skip (time not reached) |
| 10:00 AM (yesterday) | 9:00 AM (today) | No | ❌ Skip (different day) |

## Retry Logic

### Notification Retry

**Immediate Retries** (during processing):
- Max 3 attempts
- Exponential backoff: 2s, 4s, 8s
- Logs each attempt

```javascript
async function sendNotificationWithRetry(params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendNotification(params);
    } catch (error) {
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await sleep(delay);
      }
    }
  }
  throw error;
}
```

### Delayed Retries

**Retry Job** (every 6 hours):
- Finds unnotified assignments from last 24 hours
- Retries with 2 attempts (faster)
- Marks as notified if successful

## Assignment Tracking

### RotaAssignment Model

```javascript
{
  rotaId: ObjectId("..."),
  workspaceId: "T123456",
  userId: "U123456",
  assignedDate: ISODate("2024-01-23"),
  channelId: "C123456",
  notified: true,
  notificationSentAt: ISODate("2024-01-23T09:00:00Z"),
  messageTs: "1234567890.123456",
  createdAt: ISODate("2024-01-23T09:00:00Z")
}
```

**Duplicate Prevention:**
- Before creating assignment, check if one exists for today
- Uses date range query (start/end of day)
- Skips if already exists

## Logging

### Log Files

**`logs/combined.log`**
- All logs (info and above)
- Rotates at 5MB
- Keeps last 5 files

**`logs/error.log`**
- Errors only
- Rotates at 5MB
- Keeps last 5 files

**`logs/scheduler.log`**
- Scheduler-specific logs
- Most detailed
- Useful for debugging

### Log Format

```json
{
  "timestamp": "2024-01-23 09:00:00",
  "level": "info",
  "message": "Rota processed successfully",
  "service": "vibe-rotas",
  "component": "scheduler",
  "rotaId": "65abc123...",
  "rotaName": "Weekly Support",
  "userId": "U123456",
  "messageTs": "1234567890.123456"
}
```

### Important Log Messages

**Scheduler Cycle:**
- "Starting scheduler cycle"
- "Found X active rotas"
- "Scheduler cycle completed" (with stats)

**Rota Processing:**
- "Processing rota" (rotaId, rotaName)
- "Time check for rota" (timezone, currentHour, currentMinute, notificationHour, notificationMinute, hourMatches, minuteMatches)
- "Next assignment determined" (userId)
- "Rota processed successfully"
- "Rota not scheduled for today" (skipped - date, hour, or minute doesn't match)
- "Assignment already exists for today" (skipped)

**Errors:**
- "Error processing rota" (with stack trace)
- "Failed to retry notification"
- "Error in scheduler cycle"

## Admin Endpoints

### GET `/admin/scheduler/status`

Get scheduler status:

```json
{
  "running": true,
  "isProcessing": false
}
```

### POST `/admin/scheduler/run`

Manually trigger scheduler:

```bash
curl -X POST http://localhost:3000/admin/scheduler/run
```

Response:
```json
{
  "success": true,
  "results": {
    "total": 5,
    "processed": 3,
    "skipped": 2,
    "failed": 0,
    "errors": []
  }
}
```

### POST `/admin/scheduler/retry`

Manually trigger retry job:

```bash
curl -X POST http://localhost:3000/admin/scheduler/retry
```

## Configuration

### Environment Variables

```env
# Run scheduler immediately on startup (useful for testing)
RUN_SCHEDULER_ON_START=false

# Logging level
LOG_LEVEL=info
```

### Cron Expressions

```javascript
'0 * * * *'     // Every hour on the hour
'0 */6 * * *'   // Every 6 hours
'0 9 * * *'     // Every day at 9 AM
'0 9 * * 1'     // Every Monday at 9 AM
```

## Error Handling

### Common Errors

**"No active workspace found"**
- Workspace not installed or deactivated
- Solution: Check workspace is active in database

**"Channel not found"**
- Channel deleted or bot removed
- Solution: Update rota with new channel

**"not_in_channel"**
- Bot not in the channel
- Solution: Invite bot to channel

**"No members in rota"**
- All members removed
- Solution: Add members to rota

### Error Recovery

1. **Immediate Retry**: 3 attempts with backoff
2. **Delayed Retry**: Retry job every 6 hours
3. **Manual Retry**: Admin endpoint
4. **Skip**: After 24 hours, stops retrying

## Testing

### Manual Testing

```bash
# Start server
npm run dev

# Check scheduler status
curl http://localhost:3000/admin/scheduler/status

# Manually trigger scheduler (don't wait for cron)
curl -X POST http://localhost:3000/admin/scheduler/run

# Check logs
tail -f logs/scheduler.log
tail -f logs/combined.log
```

### Test Scenarios

1. **Create rota with daily frequency at 10:30 AM**
   - Should execute every day at 10:30 (in rota's timezone)

2. **Create rota with weekly frequency at 14:15 (2:15 PM)**
   - Should execute same day each week at 2:15 PM

3. **Create rota scheduled for today at current time (hour + minute)**
   - Run manual trigger
   - Check logs for processing and time check
   - Verify message sent to channel
   - Check assignment in database

4. **Create rota scheduled for today but different minute**
   - Run manual trigger
   - Should be skipped (minute doesn't match)
   - Check logs for "not scheduled for today"

5. **Test timezone conversion with minutes**
   - Create rota with America/New_York timezone, time 10:30
   - When UTC is 15:30 (10:30 AM EST), should execute
   - When UTC is 15:00 (10:00 AM EST), should skip

6. **Run scheduler twice in one day**
   - First run: processes
   - Second run: skips (already assigned)

7. **Test retry logic**
   - Temporarily break Slack API (invalid token)
   - Run scheduler
   - Check logs for retry attempts
   - Fix token
   - Run retry job
   - Verify notification sent

8. **Test edge cases**
   - Hour 0, minute 0 (midnight)
   - Hour 23, minute 45 (11:45 PM)
   - Multiple rotas at same time in different timezones
   - Test all four minute values: :00, :15, :30, :45

## Monitoring

### Health Checks

Monitor:
- Scheduler running: `/admin/scheduler/status`
- Log files growing: `ls -lh logs/`
- Database assignments: Check RotaAssignment collection
- Failed notifications: Check `notified: false` records

### Metrics to Track

- Rotas processed per cycle
- Success rate
- Average processing time
- Failed notifications
- Retry success rate

## Performance

### Optimization

- Processes rotas sequentially (not parallel)
- Prevents duplicate processing with `isRunning` flag
- Skips if already running
- Indexes on database queries:
  - `rotaId + assignedDate` (duplicate check)
  - `workspaceId + notified` (retry query)

### Scalability

For large deployments:
- Consider separate scheduler service
- Use message queue (Redis, RabbitMQ)
- Horizontal scaling with distributed locks
- Batch processing

## Troubleshooting

**Scheduler not running:**
- Check logs for startup message
- Verify cron schedule
- Check `getSchedulerStatus()` endpoint

**Messages not sent:**
- Check logs for errors
- Verify bot token valid
- Verify bot in channel
- Check rota is active
- Check RRULE is valid
- **Check notification hour matches current hour in rota's timezone**

**Messages sent at wrong time:**
- Verify rota's timezone setting
- Check notification hour and minute configuration
- Review scheduler time check logs (currentHour, currentMinute, hourMatches, minuteMatches)
- Test timezone conversion with admin endpoint
- Ensure minute is one of: 0, 15, 30, 45

**Duplicate notifications:**
- Check `assignmentExistsForToday()` logic
- Verify date comparison
- Check timezone handling

**High failure rate:**
- Check Slack API rate limits
- Verify workspace tokens valid
- Check network connectivity
- Review error logs

## Next Steps

Phase 6 will add:
- Interactive components in messages
- Skip/Swap functionality
- Manual assignment override
- Assignment history view
- Statistics and reports
