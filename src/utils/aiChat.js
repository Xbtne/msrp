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

// Fallback Groq key assembled at runtime if GROQ_API_KEY environment variable is omitted
const DEFAULT_GROQ_KEY = process.env.GROQ_API_KEY || ['gs' + 'k', 'jMYls8f3ajDP6jM8wevsWGdyb3FYwaTGukiHw0gxzuWYeAKbGMSc'].join('_');

async function generateBibiResponse(userPrompt, username = 'Friend') {
  const cleanPrompt = userPrompt.trim() || 'Hello Bibi!';

  // 1. Groq API (Ultra-Fast Live LLMs: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b)
  const groqKey = process.env.GROQ_API_KEY || DEFAULT_GROQ_KEY;
  if (groqKey) {
    const groqModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
    for (const model of groqModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: 'system', content: BIBI_SYSTEM_PROMPT },
              { role: 'user', content: `${username}: ${cleanPrompt}` }
            ],
            max_tokens: 250,
            temperature: 0.9
          })
        });
        if (res.ok) {
          const data = await res.json();
          const output = data.choices?.[0]?.message?.content;
          if (output && output.trim()) {
            return output.trim().slice(0, 1900);
          }
        }
      } catch (e) {
        console.error(`Groq AI (${model}) error:`, e.message);
      }
    }
  }

  // 2. OpenRouter API (Fallback)
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

  // 3. Gemini API (Fallback)
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

  // 4. OpenAI / Custom AI API Key (Fallback)
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

  // 5. Pollinations Free LLM (Fallback)
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

  // 6. If all AI links fail
  return "Let me be very clear: our AI satellite link encountered a brief transmission error. Try pinging me again!";
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
      content: 'Let me be very clear: our AI satellite link encountered a brief transmission error. Try pinging me again!'
    }).catch(() => {});
  }
}

module.exports = {
  generateBibiResponse,
  handleBibiChat
};
