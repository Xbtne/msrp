# 🎫 MRPD Discord Ticket Bot

A feature-packed Discord Ticket Bot built with **Discord.js v14** featuring interactive buttons, ticket categorization, transcript saving, and a staff claim system.

---

## ✨ Features

- 🎮 **3 Interactive Ticket Categories**:
  - **Game Report**: In-game bugs, glitches, server issues.
  - **Support Ticket**: General help, assistance, and questions.
  - **Player Report**: Rule violations and player reports.
- 🙋 **Staff Claim System**:
  - Staff can claim tickets with a single button click.
  - Dynamically updates the ticket embed with the staff member's avatar and name.
  - Prevents other staff from claiming an already-claimed ticket.
  - Staff member or Admins can **Unclaim** the ticket at any time.
- 🔒 **Ticket Management & Security**:
  - **Close Ticket**: Asks for confirmation to prevent accidental deletion.
  - 📑 **HTML Transcripts**: Automatically generates a transcript and DMs the user + logs to your staff log channel.
  - 👥 **Add / Remove Members**: Add extra staff or players to a ticket using `/ticket add` and `/ticket remove`.
- ⚡ **Easy Slash Commands**:
  - `/setup-panel` — Deploy the 3-button ticket panel in any channel.
  - `/ticket claim` — Claim the active ticket.
  - `/ticket unclaim` — Release the claimed ticket.
  - `/ticket close` — Close the ticket.
  - `/ticket transcript` — Generate and download an HTML transcript.
  - `/ticket add <user>` — Add a user to the ticket.
  - `/ticket remove <user>` — Remove a user from the ticket.

---

## 🛡️ Moderation Commands

The bot now includes a full suite of moderation commands:

| Command | Description | Permissions |
|---|---|---|
| `/ban <user> [reason] [delete_messages]` | Ban a user with DM alert and optional message deletion (0-7 days) | Ban Members |
| `/unban <user_id> [reason]` | Unban a user by their Discord User ID | Ban Members |
| `/kick <user> [reason]` | Kick a user with a DM notice | Kick Members |
| `/timeout set <user> <duration> [reason]` | Timeout/mute a member (e.g., `60s`, `10m`, `2h`, `1d`) | Moderate Members |
| `/timeout remove <user> [reason]` | Remove an active timeout from a member | Moderate Members |
| `/warn add <user> <reason>` | Issue a warning to a member and notify them via DM | Moderate Members |
| `/warn list <user>` | View all logged warnings for a member | Moderate Members |
| `/warn clear <user>` | Clear all warnings for a member | Moderate Members |
| `/purge <amount> [user]` | Bulk delete 1-100 messages (with optional user filter) | Manage Messages |
| `/lock channel [reason]` | Lock the current channel for @everyone | Manage Channels |
| `/lock unlock` | Unlock the current channel | Manage Channels |
| `/slowmode <seconds>` | Set channel slowmode rate limit (0 to disable) | Manage Channels |
| `/blacklist add <user> <reason>` | Blacklist a user from opening tickets | Moderate Members / Staff |
| `/blacklist remove <user>` | Remove a user from the ticket blacklist | Moderate Members / Staff |
| `/blacklist list` | View all blacklisted users in the server | Moderate Members / Staff |
| `/unblacklist <user>` | Shortcut to remove a user from the blacklist | Moderate Members / Staff |
| `/clockin [notes]` | Clock in to start a staff shift and begin activity tracking | Staff Roles / Admins |
| `/clockout [notes]` | Clock out of your active staff shift and record your activity duration | Staff Roles / Admins |
| `/shifts active` | List all staff members currently clocked in and on duty | Staff / Members |
| `/shifts stats [staff]` | View activity hours, total shifts, average shift length & history | Staff / Members |
| `/shifts leaderboard` | View staff activity leaderboard ranked by total clocked hours | Staff / Members |
| `/setup-duty [channel]` | Deploy the live interactive Clocky Duty panel for staff check-ins | Manage Guild / Staff |
| `/applicationsetup [channel] [review_channel]` | Deploy the MSRC Staff Application panel with 9 DM questions | Manage Guild / Staff |
| `/staffreview <staff> <rating> <review> [anonymous]` | Submit a star review & feedback for a staff member | @everyone |
| `/setupcomp [action] [channel_name]` | Deploy Honeypot channel to catch & auto-quarantine compromised accounts | Administrator |


---

## ⚙️ Configuration (`config.json`)

You can customize roles, categories, and colors inside [`config.json`](./config.json):

```json
{
  "staffRoleIds": ["123456789012345678"], // Add your Staff/Admin Role ID(s) here
  "logChannelId": "123456789012345678",   // Optional: Channel ID to receive transcript logs
  "panel": {
    "title": "📬 Support & Assistance Desk",
    "description": "Click one of the buttons below to open a ticket...",
    "color": "#5865F2"
  }
}
```

> **Note:** If `staffRoleIds` is left empty, anyone with **Administrator** or **Manage Channels** permissions (or roles named *Staff*, *Admin*, *Support*, *Mod*) will automatically be recognized as staff!

---

## 🚀 How to Run

1. **Start the Bot**:
   ```bash
   npm start
   ```
   Or for auto-reload during development:
   ```bash
   npm run dev
   ```

2. **Deploy the Panel in Discord**:
   - In Discord, run `/setup-panel` in the channel where you want users to see the ticket buttons (e.g. `#tickets` or `#support`).

---

## 🔑 Discord Developer Portal Requirements

Ensure the following are enabled under **Bot** in your [Discord Developer Portal](https://discord.com/developers/applications):
- **Privileged Gateway Intents**:
  - ✅ **Server Members Intent**
  - ✅ **Message Content Intent**
- **Bot Permissions** when inviting to your server:
  - Manage Channels
  - View Channels
  - Send Messages
  - Embed Links
  - Attach Files
  - Read Message History
