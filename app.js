import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';

const SERVER_URL = process.env.BACKEND_SERVER_URL || null;
const MAX_HISTORY_PER_CHANNEL = 20; // Max message pairs to keep per channel

// Map entries map arrays of user IDs to a magic word that will be prepended
// to the prompt sent to the backend for recognition/behavior.
const MAGIC_WORD_MAP = [
  { users: ['246323461109186560'], magic: process.env.CADISTAN_STYLE_SECRET || null},
  { users: ['1095063948371431446'], magic: process.env.STUPID_STYLE_SECRET || null},
  { users: ['536992895731892252', '1407380855688659036'], magic: process.env.RUDE_STYLE_SECRET || null},
  { users: ['475447912730460160', '572154995302989844'], magic: process.env.LINKEDIN_STYLE_SECRET || null},
  { users: ['489538771214270464'], magic: process.env.FLIRTY_STYLE_SECRET || null},
];

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

/**
 * In-memory conversation history storage
 * Keyed by channel ID, stores array of {role, content} messages
 */
const conversationHistory = new Map();

/**
 * Get conversation history for a channel
 */
function getConversationHistory(channelId) {
  if (!conversationHistory.has(channelId)) {
    conversationHistory.set(channelId, []);
  }
  return conversationHistory.get(channelId);
}

/**
 * Add message to conversation history and maintain buffer limit
 */
function addToHistory(channelId, role, content) {
  const history = getConversationHistory(channelId);
  history.push({ role, content });
  
  // Keep only the most recent messages (limited buffer)
  if (history.length > MAX_HISTORY_PER_CHANNEL * 2) {
    history.splice(0, history.length - MAX_HISTORY_PER_CHANNEL * 2);
  }
}

/**
 * Format conversation history into a context string
 */
function formatHistoryContext(history) {
  return history
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Tetis'}: ${msg.content}`)
    .join('\n');
}

function getInteractionUserId(payload) {
  return payload.member?.user?.id ?? payload.user?.id ?? payload.user_id ?? null;
}

function getMagicWordForUser(payload) {
  const userId = getInteractionUserId(payload);
  if (!userId) return null;
  for (const entry of MAGIC_WORD_MAP) {
    if (entry.users.includes(userId)) return entry.magic;
  }
  return null;
}

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  const { type, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    if (name === 'ask') {
      const prompt = data.options?.find((option) => option.name === 'prompt')?.value;
      const channelId = req.body.channel_id;
      const interactionToken = req.body.token;
      const applicationId = process.env.APP_ID;
      const magicWord = getMagicWordForUser(req.body);
      const useMagic = Boolean(magicWord);
      const styleLogTag = useMagic ? `[MAGIC:${magicWord}]` : '';

      if (!prompt) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Please provide a prompt.' },
        });
      }

      // Defer the interaction immediately to acknowledge the command
      // This gives us up to 15 minutes to send the follow-up response
      res.send({
        type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
      });

      // Handle the LLM request asynchronously (don't await, fire and forget)
      (async () => {
        try {
          // Get conversation history for this channel
          const history = getConversationHistory(channelId);
          console.log(`\n${styleLogTag} [Channel ${channelId}] User Question:`, prompt);

          // Format conversation context and include in prompt
          let historyContext = formatHistoryContext(history);
          let enhancedPrompt = historyContext
            ? `Conversation history:\n${historyContext}\n\nNew question: ${prompt}`
            : `${prompt}`;

          // Prepend magic word to the prompt when applicable so backend can detect it
          if (useMagic) {
            enhancedPrompt = `${magicWord}\n\n${enhancedPrompt}`;
          }

          // Prepare the request with conversation context
          const requestBody = {
            prompt: enhancedPrompt,
            history, // Include full conversation history array as well
          };

          // If no backend URL is configured, inform the user and stop.
          if (!SERVER_URL) {
            const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
            await fetch(webhookUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: 'Tetis is down 🥀' }),
            }).catch(err => console.error('Failed to send backend-missing webhook:', err));
            return;
          }

          const response = await fetch(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });

          if (!response.ok) {
            throw new Error(`Backend returned ${response.status}`);
          }

          const data = await response.json();
          const reply = (data.reply || 'Error: no reply returned').toString();
          console.log(`${styleLogTag} [Channel ${channelId}] Tetis Answer:`, reply);
          
          // Add user message and assistant reply to history
          addToHistory(channelId, 'user', prompt);
          addToHistory(channelId, 'assistant', reply);
          console.log(`[Channel ${channelId}] History length after update: ${getConversationHistory(channelId).length}\n`);

          const echoedQuestion = `**You**: ${prompt}`;
          const fullReply = `**Tetis**: ${reply}`;
          const maxDiscordMessageLength = 2000;
          const content = `${echoedQuestion}\n${fullReply}`.slice(0, maxDiscordMessageLength);

          // Edit the deferred response via webhook
          const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
          await fetch(webhookUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          });
        } catch (error) {
          console.error('LLM request failed:', error);
          // Edit the deferred response with generic down message via webhook
          const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
          await fetch(webhookUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: 'Tetis is down 🥀' }),
          }).catch(err => console.error('Failed to send error webhook:', err));
        }
      })();

      // Return early to prevent trying to send another response
      return;
    }

    if (name === 'lobotomize') {
      const channelId = req.body.channel_id;
      const historyLength = getConversationHistory(channelId).length;
      conversationHistory.delete(channelId);
      console.log(`\n[Channel ${channelId}] Lobotomize command executed. Cleared ${historyLength} messages from history.\n`);
      
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "Bluh bluh bluh. Tetis has been lobotomized for this channel. It's probably for the best."
         },
      });
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
