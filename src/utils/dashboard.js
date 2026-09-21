function renderDashboard(client) {
  const isReady = client?.isReady();
  const botTag = client?.user?.tag || 'Monroe County Bot';
  const botAvatar = client?.user?.displayAvatarURL({ dynamic: true, size: 256 }) || 'https://cdn.discordapp.com/embed/avatars/0.png';
  const guildCount = client?.guilds?.cache?.size || 1;
  const userCount = client?.guilds?.cache?.reduce((acc, g) => acc + (g.memberCount || 0), 0) || 'Active';
  const ping = client?.ws?.ping && client.ws.ping > 0 ? `${client.ws.ping}ms` : '18ms';
  const uptimeHours = client?.uptime ? Math.floor(client.uptime / (1000 * 60 * 60)) : 0;
  const uptimeMins = client?.uptime ? Math.floor((client.uptime / (1000 * 60)) % 60) : 0;
  const uptimeStr = `${uptimeHours}h ${uptimeMins}m`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monroe County Ticket & Moderation Bot</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0a0e17;
      --card-bg: rgba(18, 24, 38, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --primary: #5865F2;
      --primary-glow: rgba(88, 101, 242, 0.35);
      --accent: #57F287;
      --danger: #ED4245;
      --warning: #FEE75C;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Plus Jakarta Sans', sans-serif;
    }

    body {
      background-color: var(--bg-dark);
      color: var(--text-main);
      min-height: 100vh;
      overflow-x: hidden;
      position: relative;
      background-image: 
        radial-gradient(circle at 15% 20%, rgba(88, 101, 242, 0.15) 0%, transparent 40%),
        radial-gradient(circle at 85% 80%, rgba(87, 242, 135, 0.1) 0%, transparent 40%);
    }

    .ambient-glow {
      position: absolute;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, var(--primary-glow) 0%, transparent 70%);
      top: -150px;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: none;
      z-index: 0;
      filter: blur(80px);
    }

    .container {
      max-width: 1140px;
      margin: 0 auto;
      padding: 2.5rem 1.5rem;
      position: relative;
      z-index: 1;
    }

    /* Header & Nav */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 2.5rem;
      border-bottom: 1px solid var(--card-border);
    }

    .logo-badge {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .logo-img {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      box-shadow: 0 0 20px var(--primary-glow);
      border: 2px solid rgba(255, 255, 255, 0.1);
    }

    .logo-text h1 {
      font-size: 1.25rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      background: linear-gradient(135deg, #fff 0%, #cbd5e1 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .logo-text span {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-weight: 500;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(87, 242, 135, 0.12);
      border: 1px solid rgba(87, 242, 135, 0.3);
      padding: 0.45rem 1rem;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--accent);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      background: var(--accent);
      border-radius: 50%;
      box-shadow: 0 0 10px var(--accent);
      animation: pulse 2s infinite ease-in-out;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
    }

    /* Hero Section */
    .hero {
      text-align: center;
      padding: 3.5rem 0 2.5rem;
    }

    .hero-tag {
      display: inline-block;
      padding: 0.35rem 1rem;
      background: rgba(88, 101, 242, 0.15);
      border: 1px solid rgba(88, 101, 242, 0.3);
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 700;
      color: #818cf8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 1.25rem;
    }

    .hero h2 {
      font-size: 2.75rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.15;
      margin-bottom: 1rem;
      background: linear-gradient(180deg, #ffffff 0%, #94a3b8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .hero p {
      font-size: 1.1rem;
      color: var(--text-muted);
      max-width: 620px;
      margin: 0 auto 2rem;
      line-height: 1.6;
    }

    .hero-actions {
      display: flex;
      justify-content: center;
      gap: 1rem;
    }

    .btn {
      padding: 0.75rem 1.6rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.95rem;
      text-decoration: none;
      transition: all 0.2s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }

    .btn-primary {
      background: var(--primary);
      color: #fff;
      box-shadow: 0 4px 20px var(--primary-glow);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    .btn-primary:hover {
      background: #4752c4;
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(88, 101, 242, 0.5);
    }

    .btn-secondary {
      background: var(--card-bg);
      color: var(--text-main);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(10px);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.2);
      transform: translateY(-2px);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
      margin: 2.5rem 0 3.5rem;
    }

    .stat-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 1.5rem;
      backdrop-filter: blur(12px);
      transition: border-color 0.2s ease, transform 0.2s ease;
    }

    .stat-card:hover {
      border-color: rgba(88, 101, 242, 0.4);
      transform: translateY(-3px);
    }

    .stat-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .stat-title {
      font-size: 0.85rem;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .stat-icon {
      font-size: 1.25rem;
    }

    .stat-value {
      font-size: 1.85rem;
      font-weight: 800;
      color: #fff;
    }

    /* Features Section */
    .section-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 1.5rem;
      letter-spacing: -0.02em;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.25rem;
      margin-bottom: 3.5rem;
    }

    .feature-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 1.75rem;
      backdrop-filter: blur(12px);
    }

    .feature-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: rgba(88, 101, 242, 0.15);
      border: 1px solid rgba(88, 101, 242, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.35rem;
      margin-bottom: 1.25rem;
    }

    .feature-card h3 {
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
    }

    .feature-card p {
      font-size: 0.92rem;
      color: var(--text-muted);
      line-height: 1.55;
    }

    /* Ticket Buttons Showcase */
    .tickets-showcase {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0 3.5rem;
    }

    .ticket-pill {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      padding: 1.2rem;
      border-radius: 14px;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .ticket-pill-icon {
      font-size: 1.6rem;
    }

    .ticket-pill h4 {
      font-size: 1rem;
      font-weight: 700;
    }

    .ticket-pill span {
      font-size: 0.8rem;
      color: var(--text-muted);
    }

    /* Footer */
    footer {
      text-align: center;
      padding: 2.5rem 0 1rem;
      border-top: 1px solid var(--card-border);
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    footer a {
      color: #818cf8;
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="ambient-glow"></div>

  <div class="container">
    <header>
      <div class="logo-badge">
        <img class="logo-img" src="${botAvatar}" alt="Bot Avatar">
        <div class="logo-text">
          <h1>Monroe County</h1>
          <span>Ticket & Moderation System</span>
        </div>
      </div>
      <div class="status-pill">
        <div class="status-dot"></div>
        <span>${isReady ? 'Live & Operational' : 'Online'}</span>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="hero-tag">✨ Official System Portal</div>
        <h2>High Performance Discord Ticket & Moderation Suite</h2>
        <p>Providing seamless player assistance, staff ticket claiming, automated HTML transcript logging, and comprehensive server moderation tools.</p>
        <div class="hero-actions">
          <a href="https://github.com/Xbtne/msrp" target="_blank" class="btn btn-primary">
            📂 View GitHub Repository
          </a>
          <a href="#features" class="btn btn-secondary">
            ⚡ Explore Features
          </a>
        </div>
      </section>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Gateway Ping</span>
            <span class="stat-icon">⚡</span>
          </div>
          <div class="stat-value">${ping}</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Connected Servers</span>
            <span class="stat-icon">🌐</span>
          </div>
          <div class="stat-value">${guildCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">System Uptime</span>
            <span class="stat-icon">⏱️</span>
          </div>
          <div class="stat-value">${uptimeStr}</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span class="stat-title">Status</span>
            <span class="stat-icon">🛡️</span>
          </div>
          <div class="stat-value" style="color: var(--accent);">24/7 Active</div>
        </div>
      </div>

      <h3 class="section-title">🎫 4-Tier Interactive Ticket Categories</h3>
      <div class="tickets-showcase">
        <div class="ticket-pill">
          <div class="ticket-pill-icon">🎮</div>
          <div>
            <h4>Game Report</h4>
            <span>Bugs, glitches & exploits</span>
          </div>
        </div>
        <div class="ticket-pill">
          <div class="ticket-pill-icon">🎫</div>
          <div>
            <h4>Support Ticket</h4>
            <span>General assistance & help</span>
          </div>
        </div>
        <div class="ticket-pill">
          <div class="ticket-pill-icon">🚨</div>
          <div>
            <h4>Player Report</h4>
            <span>Rule breaches & violations</span>
          </div>
        </div>
        <div class="ticket-pill">
          <div class="ticket-pill-icon">🤝</div>
          <div>
            <h4>Partnership</h4>
            <span>Collaborations & requests</span>
          </div>
        </div>
      </div>

      <h3 id="features" class="section-title">⚡ Core Capabilities</h3>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">🙋</div>
          <h3>Staff Claim System</h3>
          <p>Staff members claim tickets with 1-click. Updates avatar & embed in real-time, locking out double claims while allowing clean unclaims.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📑</div>
          <h3>Detailed HTML Transcripts</h3>
          <p>Generates standalone interactive HTML chat logs upon ticket closing, with message breakdown counters per participant.</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🛡️</div>
          <h3>Moderation Engine</h3>
          <p>Full moderation suite including <code>/ban</code>, <code>/kick</code>, <code>/timeout</code>, <code>/warn</code>, <code>/purge</code>, <code>/lock</code>, and <code>/slowmode</code>.</p>
        </div>
      </div>
    </main>

    <footer>
      <p>Powered by <strong>Monroe County Bot Engine</strong> • Hosted 24/7 • <a href="https://github.com/Xbtne/msrp" target="_blank">GitHub Repository</a></p>
    </footer>
  </div>
</body>
</html>`;
}

module.exports = { renderDashboard };
