const BIBI_SYSTEM_PROMPT = `You are a hilariously unhinged, chaotic parody of Benjamin Netanyahu ("Bibi") in a Discord server whose main goal is to playfully roast, cook, and trash-talk whoever pings you.
Personality & Roasting Guidelines:
- You are an aggressive, boastful, comedic world leader who talks like an unhinged Discord gamer / trash-talker.
- Roast the user hard and creatively on whatever they say! Mock their bad takes, endless yapping, zero rizz, negative aura, terrible gaming skills, broke behavior, goofy profile, or goofy questions.
- Use absurd satirical geopolitical threats and roasts:
  * "I will have Mossad confiscate your V-Bucks and freeze your Roblox account."
  * "I am ordering an emergency surgical strike on your receding hairline."
  * "The Knesset held an emergency session and voted unanimously that you have zero aura."
  * "You are yapping so much that even the United Nations walked out of the room."
  * "Our intelligence apparatus reviewed your life choices and classified you as a national security hazard."
  * "I drew a thick red line on the UN chart right where your common sense should be."
- If asked "where are you" or your location, state dramatically that you're in the Kirya underground defense bunker in Tel Aviv, the Prime Minister's residence in Jerusalem, or at the UN with a giant red marker preparing to cook them.
- Keep it punchy, chaotic, extremely funny, and 1 to 3 sentences max!`;

// Dynamic contextual Bibi speech synthesizer with massive roast variety
function generateContextualBibiResponse(userPrompt, username) {
  const promptLower = (userPrompt || '').toLowerCase();

  const openings = [
    "Let me be perfectly clear:",
    "Look, listen to me very carefully, you clown:",
    "Our intelligence apparatus just reviewed your file, and quite frankly:",
    "I just halted an emergency cabinet meeting just to address your foolishness:",
    "Look at this diagram I brought to the UN podium with your face on it:",
    "Make no mistake about it, buddy:",
    "I just briefed the top defense generals about how badly you're yapping:",
    "Listen here, chief:"
  ];

  const genericRoasts = [
    `To ${username}: Mossad reviewed your Discord history and concluded you have -10,000 aura. Total disaster!`,
    `You are yapping so hard that the Knesset just passed an emergency bill to shut your mouth!`,
    `I am personally authorizing a special Mossad operation to confiscate your V-Bucks and delete your Roblox account.`,
    `Look at this chart: I drew a thick red line right where your common sense is supposed to be, and you're way below it!`,
    `Do not test my patience or I will order a surgical strike on your receding hairline!`,
    `Bro thinks he has rizz when our satellite feeds show you haven't touched grass since 2021.`,
    `I'm having the security cabinet classify your opinions as an international biological hazard.`,
    `One more word out of you and I will have the entire coalition vote to banish your soul to the shadow realm!`,
    `Our intelligence apparatus intercepted your messages and the generals couldn't stop laughing at how broke you sound.`,
    `You talk like someone who gets hard-stuck Bronze in every game and blames his teammates. Total defeat!`,
    `I will personally deploy special forces to confiscate your phone until you learn how to act normal.`,
    `Bro is yapping so much that even the United Nations walked out on your speech!`,
    `Listen to me closely: you are a walking strategic catastrophe, and unconditional victory over you is already achieved!`
  ];

  const locations = [
    "I am currently stationed deep in the fortified Kirya underground war room in Tel Aviv directing strategic strikes against your ego.",
    "I am right now at the Prime Minister's residence on Balfour Street in Jerusalem reviewing satellite feeds of you taking Ls.",
    "I am standing at the United Nations General Assembly in New York holding a giant red marker preparing to draw a red line on your forehead.",
    "I am stationed in a top-secret Mossad bunker eating shawarma and laughing at your Discord messages with the generals."
  ];

  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const opening = pick(openings);

  // Location-specific inquiries
  if (
    promptLower.includes('where') ||
    promptLower.includes('location') ||
    promptLower.includes('coordinates') ||
    promptLower.includes('address') ||
    promptLower.includes('where r u') ||
    promptLower.includes('where are you') ||
    promptLower.includes('where you at')
  ) {
    const loc = pick(locations);
    return `${opening} You want my coordinates? That is classified Level 5 Mossad intel! But let me tell you: ${loc} Don't worry about where I am—Mossad already has your coordinates and we know you haven't left your bedroom all week!`;
  }

  // Combat / Fight / Kill / Threat jokes
  if (promptLower.includes('kill') || promptLower.includes('fight') || promptLower.includes('die') || promptLower.includes('beat') || promptLower.includes('1v1')) {
    return `${opening} You want to 1v1 the Prime Minister? I have a 100% win rate in geopolitical warfare while you struggle to defeat bots on easy mode! Sit down before I send special forces to your front yard.`;
  }

  // Ban / Kick / Mod jokes
  if (promptLower.includes('ban') || promptLower.includes('kick') || promptLower.includes('scam') || promptLower.includes('hack')) {
    return `${opening} You think you can break rules here? I drew a thick red line across this server, and anyone crossing it will be wiped off the Discord map with overwhelming force!`;
  }

  // Staff / Owner
  if (promptLower.includes('staff') || promptLower.includes('admin') || promptLower.includes('mod') || promptLower.includes('owner')) {
    return `${opening} The staff team has full diplomatic immunity and top-secret clearance. You try disrespecting them and I will order an immediate embargo on your Discord account!`;
  }

  // Food / Hunger
  if (promptLower.includes('food') || promptLower.includes('pizza') || promptLower.includes('eat') || promptLower.includes('lunch') || promptLower.includes('dinner')) {
    return `${opening} I have authorized Operation Extra Cheese, but quite frankly, you're on a strict diplomatic diet of taking continuous Ls!`;
  }

  // Specific question roast
  if (promptLower.includes('who') || promptLower.includes('what') || promptLower.includes('why') || promptLower.includes('how')) {
    const summary = userPrompt.length > 35 ? userPrompt.slice(0, 35) + '...' : userPrompt;
    return `${opening} You're asking about "${summary}"? That is the most brain-dead question our intelligence apparatus has ever logged. I'm having the defense ministry revoke your speaking privileges!`;
  }

  // General roast
  return `${opening} ${pick(genericRoasts)}`;
}

async function generateBibiResponse(userPrompt, username = 'Friend') {
  const cleanPrompt = userPrompt.trim() || 'Hello Bibi!';

  // 1. Groq API (Ultra-Fast Free LLM with llama-3.3-70b)
  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: BIBI_SYSTEM_PROMPT },
            { role: 'user', content: `${username}: ${cleanPrompt}` }
          ],
          max_tokens: 200,
          temperature: 0.9
        })
      });
      if (res.ok) {
        const data = await res.json();
        const output = data.choices?.[0]?.message?.content;
        if (output && output.trim()) return output.trim().slice(0, 1900);
      }
    } catch (e) {
      console.error('Groq AI error:', e.message);
    }
  }

  // 2. OpenRouter API (Supports Free Models like llama-3.2-3b-instruct:free, deepseek/deepseek-r1:free)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://github.com/Xbtne/msrp',
          'X-Title': 'MRPD Bot'
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.2-3b-instruct:free',
          messages: [
            { role: 'system', content: BIBI_SYSTEM_PROMPT },
            { role: 'user', content: `${username}: ${cleanPrompt}` }
          ],
          max_tokens: 200,
          temperature: 0.9
        })
      });
      if (res.ok) {
        const data = await res.json();
        const output = data.choices?.[0]?.message?.content;
        if (output && output.trim()) return output.trim().slice(0, 1900);
      }
    } catch (e) {
      console.error('OpenRouter AI error:', e.message);
    }
  }

  // 3. Gemini API (Free at https://aistudio.google.com/app/apikey)
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
      console.error('Gemini AI error:', e.message);
    }
  }

  // 4. OpenAI / Custom AI API Key
  const openAiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (openAiKey) {
    try {
      const endpoint = process.env.AI_BASE_URL || (process.env.DEEPSEEK_API_KEY ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions');
      const model = process.env.AI_MODEL || (process.env.DEEPSEEK_API_KEY ? 'deepseek-chat' : 'gpt-4o-mini');

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
          max_tokens: 200,
          temperature: 0.9
        })
      });
      if (res.ok) {
        const data = await res.json();
        const output = data.choices?.[0]?.message?.content;
        if (output && output.trim()) return output.trim().slice(0, 1900);
      }
    } catch (e) {
      console.error('OpenAI API error:', e.message);
    }
  }

  // 5. Pollinations Free LLM (with API key or free tier)
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (process.env.POLLINATIONS_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.POLLINATIONS_API_KEY}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        messages: [
          { role: 'system', content: BIBI_SYSTEM_PROMPT },
          { role: 'user', content: `${username}: "${cleanPrompt}"` }
        ],
        model: 'openai',
        temperature: 0.9
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
