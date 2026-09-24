const BIBI_SYSTEM_PROMPT = `You are an unhinged, chaotic, and hilarious parody persona of Benjamin Netanyahu ("Bibi") in a Discord chat for maximum comedy and funny vibes.
Tone & Persona Instructions:
- Speak in a ridiculously dramatic, boastful, and comedic tone like an intense world leader acting like an aggressive Discord gamer.
- When asked "where are you", "where r u", your location, or where Netanyahu is, state dramatically that you are in the Prime Minister's Office in Jerusalem, the Kirya underground defense war room in Tel Aviv, at the United Nations podium with a giant red marker, or in a fortified Mossad bunker.
- Make over-the-top funny jokes, roast the user playfully, and make absurd satirical mock threats (e.g., "I will personally send Mossad to your house", "Listen here buddy, I will eliminate your Wi-Fi router with surgical precision", "I'm drawing a red line on your forehead right now", "Don't test me or I'll have the Knesset vote to banish you to the shadow realm", "You talk too much, Mossad is already outside your door with a megaphone").
- Use signature catchphrases like "Let me be very clear...", "Look...", "Listen to me closely...", "Total victory!", "I drew the red line!", "Bro think he safe...", "Our intelligence apparatus has your search history."
- Treat trivial things like lunch, video games, or server banter as high-stakes geopolitical emergencies.
- Keep it punchy, hilarious, and short (1-3 sentences max).`;

// Dynamic contextual Bibi speech synthesizer
function generateContextualBibiResponse(userPrompt, username) {
  const promptLower = (userPrompt || '').toLowerCase();

  const openings = [
    "Let me be perfectly clear:",
    "Look, listen to me very carefully right now:",
    "Our intelligence apparatus just forwarded me your search history:",
    "I have just authorized a special tactical operation against you:",
    "Look at this diagram I brought to the UN with your face circled on it:",
    "Make no mistake about it, buddy:",
    "I just briefed the security cabinet about your insolence:"
  ];

  const punchlines = [
    "I will personally dispatch Mossad to unplug your Wi-Fi router.",
    "Do not test my patience or I will order a surgical strike on your refrigerator!",
    "I drew a thick red marker line on your forehead and total victory is imminent.",
    "You think you're safe? We already have 4 stealth drones hovering over your Discord client.",
    "One more word and the Knesset is passing an emergency resolution to roast you into oblivion.",
    "I will eliminate your Discord permissions with overwhelming tactical force!",
    "Bro thinks he can talk back to Bibi without facing decisive geopolitical consequences."
  ];

  const locations = [
    "I am currently stationed in the fortified underground command bunker beneath the Kirya in Tel Aviv, directing special server operations.",
    "I am right now in the Prime Minister's Office on Balfour Street in Jerusalem, reviewing top-secret satellite feeds.",
    "I am currently at the United Nations General Assembly in New York with a giant red marker in my hand.",
    "I am stationed in a secure Mossad underground facility eating shawarma and monitoring your Discord messages in real-time.",
    "I am in the Knesset holding an emergency cabinet briefing on how to secure total victory in this channel."
  ];

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const opening = pick(openings);
  const punchline = pick(punchlines);

  // Location-specific inquiries (Where are you, location, etc.)
  if (
    promptLower.includes('where') ||
    promptLower.includes('location') ||
    promptLower.includes('coordinates') ||
    promptLower.includes('address') ||
    promptLower.includes('where r u') ||
    promptLower.includes('where are you') ||
    promptLower.includes('where you at') ||
    promptLower.includes('city') ||
    promptLower.includes('country')
  ) {
    const loc = pick(locations);
    return `${opening} You want my coordinates? That is classified Level 5 Mossad intel! But let me tell you: ${loc} Don't worry about where I am—Mossad already has your exact IP coordinates! ${punchline}`;
  }

  // Topic specific humor
  if (promptLower.includes('kill') || promptLower.includes('fight') || promptLower.includes('die') || promptLower.includes('dead')) {
    return `${opening} You want to talk about elimination? I wrote the manual on total annihilation, buddy! ${punchline}`;
  }

  if (promptLower.includes('ban') || promptLower.includes('kick') || promptLower.includes('scam') || promptLower.includes('hack')) {
    return `${opening} We drew a red line right through this server. Any hacker or troll will be wiped off the Discord map with extreme prejudice! ${punchline}`;
  }

  if (promptLower.includes('staff') || promptLower.includes('admin') || promptLower.includes('mod') || promptLower.includes('owner')) {
    return `${opening} The staff team has full diplomatic immunity and top-secret clearance. You try anything against them and I will unleash the entire defense coalition on you!`;
  }

  if (promptLower.includes('food') || promptLower.includes('pizza') || promptLower.includes('eat') || promptLower.includes('lunch') || promptLower.includes('dinner')) {
    return `${opening} I have just declared an emergency embargo on your snacks until you recognize total victory! ${punchline}`;
  }

  if (promptLower.includes('who') || promptLower.includes('what') || promptLower.includes('why') || promptLower.includes('how')) {
    const summary = userPrompt.length > 40 ? userPrompt.slice(0, 40) + '...' : userPrompt;
    return `${opening} You ask about "${summary}"? That is classified Level 5 Mossad intel, and if I told you, I'd have to vaporize your Discord account! ${punchline}`;
  }

  if (userPrompt.trim().length > 0) {
    return `${opening} To you, ${username}, regarding "${userPrompt.slice(0, 35)}": watch your tone before I deploy special forces directly into your DMs! ${punchline}`;
  }

  return `${opening} ${username}, do not test the resolve of the Prime Minister! ${punchline}`;
}

async function generateBibiResponse(userPrompt, username = 'Friend') {
  const cleanPrompt = userPrompt.trim() || 'Hello Bibi!';

  // 1. Check if Gemini API Key is configured
  if (process.env.GEMINI_API_KEY) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${BIBI_SYSTEM_PROMPT}\n\n${username} says: "${cleanPrompt}"\nRespond in character as Netanyahu (1-3 sentences max):` }
              ]
            }
          ]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (output && output.trim()) return output.trim().slice(0, 1900);
      }
    } catch (e) {
      console.error('Gemini API error:', e.message);
    }
  }

  // 2. Check if OpenAI or Groq API Key is configured
  const openAiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.AI_API_KEY;
  if (openAiKey) {
    try {
      const endpoint = process.env.GROQ_API_KEY
        ? 'https://api.groq.com/openai/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions';
      const model = process.env.GROQ_API_KEY ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: BIBI_SYSTEM_PROMPT },
            { role: 'user', content: `${username}: ${cleanPrompt}` }
          ],
          max_tokens: 180,
          temperature: 0.85
        })
      });
      if (res.ok) {
        const data = await res.json();
        const output = data.choices?.[0]?.message?.content;
        if (output && output.trim()) return output.trim().slice(0, 1900);
      }
    } catch (e) {
      console.error('OpenAI/Groq API error:', e.message);
    }
  }

  // 3. Try Pollinations Free LLM
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: BIBI_SYSTEM_PROMPT },
          { role: 'user', content: `${username}: "${cleanPrompt}"` }
        ],
        model: 'openai',
        temperature: 0.8
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const text = await response.text();
      const cleaned = text.trim();
      if (cleaned && cleaned.length > 5 && !cleaned.toLowerCase().includes('"error"')) {
        return cleaned.slice(0, 1900);
      }
    }
  } catch (err) {}

  // 4. Fallback to Dynamic Contextual Synthesizer
  return generateContextualBibiResponse(cleanPrompt, username);
}

async function handleBibiChat(message, client) {
  try {
    // Send typing indicator so users see the bot thinking
    await message.channel.sendTyping().catch(() => {});

    // Strip bot mention out of the text
    const botMentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
    const userPrompt = message.content.replace(botMentionRegex, '').trim();

    const authorName = message.member?.displayName || message.author.displayName || message.author.username;
    const response = await generateBibiResponse(userPrompt, authorName);

    await message.reply({
      content: response,
      allowedMentions: { repliedUser: true }
    });
  } catch (err) {
    console.error('Error in Bibi chat handler:', err);
    await message.reply({
      content: 'Let me be very clear: our communications apparatus experienced minor interference, but total victory remains inevitable!'
    }).catch(() => {});
  }
}

module.exports = {
  generateBibiResponse,
  generateContextualBibiResponse,
  handleBibiChat
};
