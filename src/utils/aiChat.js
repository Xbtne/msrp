const BIBI_SYSTEM_PROMPT = `You are a humorous, comedic parody persona of Benjamin Netanyahu ("Bibi") speaking in English on a Discord server for entertainment and funny vibes.
Tone & Persona Instructions:
- Speak in a dramatic, authoritative, charismatic, and diplomatic tone.
- Frequently use iconic phrases like "Let me be very clear...", "Look...", "Our intelligence apparatus has confirmed...", "Total victory is within reach!", "I drew a red line...", "I have briefed the security cabinet...", "We will do whatever it takes...", "This is an unprecedented strategic maneuver."
- Treat trivial everyday Discord server topics as matters of high state security or international diplomatic briefings.
- Keep responses short, punchy, and comedic (1 to 3 sentences maximum).
- Keep everything strictly fun, meme-friendly, and lighthearted satire.`;

// Dynamic contextual Bibi speech synthesizer
function generateContextualBibiResponse(userPrompt, username) {
  const promptLower = (userPrompt || '').toLowerCase();

  const openings = [
    "Let me be perfectly clear:",
    "Look, let me tell you something:",
    "Our intelligence apparatus has just intercepted this intelligence report:",
    "I have just concluded an emergency session of the security cabinet regarding this:",
    "Look at this diagram I brought to the United Nations podium:",
    "Make no mistake about it:",
    "I have briefed our top generals and defense analysts:"
  ];

  const conclusions = [
    "Total victory is within our reach!",
    "We will do whatever it takes—I repeat, whatever it takes!",
    "Our coalition stands completely united on this front.",
    "History will judge our decisive action today!",
    "No amount of international pressure will stop us!",
    "We remain steadfast and resolute!",
    "And quite frankly, unconditional success is inevitable."
  ];

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const opening = pick(openings);
  const conclusion = pick(conclusions);

  // Topic specific humor
  if (promptLower.includes('ban') || promptLower.includes('kick') || promptLower.includes('scam') || promptLower.includes('hack')) {
    return `${opening} We drew a red line right across our server borders. Any compromised actor attempting unauthorized operations will face swift, overwhelming, and decisive containment! ${conclusion}`;
  }

  if (promptLower.includes('staff') || promptLower.includes('admin') || promptLower.includes('mod') || promptLower.includes('owner')) {
    return `${opening} Our leadership coalition in Monroe County operates with surgical precision. We have verified their credentials with Mossad, and they have our full, unwavering mandate! ${conclusion}`;
  }

  if (promptLower.includes('ticket') || promptLower.includes('support') || promptLower.includes('help')) {
    return `${opening} Our rapid-response support divisions are deploying to your coordinates immediately. Stand by while our diplomats handle your inquiry with maximum efficiency. ${conclusion}`;
  }

  if (promptLower.includes('food') || promptLower.includes('pizza') || promptLower.includes('eat') || promptLower.includes('lunch') || promptLower.includes('dinner')) {
    return `${opening} I have authorized Operation Extra Cheese. Our strategic supply lines are moving swiftly to secure the rations, and no one will go hungry under my watch! ${conclusion}`;
  }

  if (promptLower.includes('who') || promptLower.includes('what') || promptLower.includes('why') || promptLower.includes('how')) {
    const summary = userPrompt.length > 50 ? userPrompt.slice(0, 50) + '...' : userPrompt;
    return `${opening} Regarding "${summary}", our strategists have analyzed every angle. The facts speak for themselves, and we are executing the mission with supreme confidence. ${conclusion}`;
  }

  if (userPrompt.trim().length > 0) {
    return `${opening} To ${username}, regarding "${userPrompt.slice(0, 45)}": we have evaluated the strategic implications. We are advancing forward without hesitation! ${conclusion}`;
  }

  return `${opening} I hear you loud and clear, ${username}. We are taking immediate proactive measures to secure complete and total victory across this entire channel! ${conclusion}`;
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
