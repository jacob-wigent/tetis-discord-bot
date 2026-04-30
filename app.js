import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseType,
  InteractionType,
  verifyKeyMiddleware,
} from 'discord-interactions';

const SERVER_URL = 'https://gpt-backend-7wpo.onrender.com/ask';
const MAX_HISTORY_PER_CHANNEL = 20; // Max message pairs to keep per channel

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

      if (!prompt) {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Please provide a prompt.' },
        });
      }

      try {
        // Get conversation history for this channel
        const history = getConversationHistory(channelId);

        // Prepare the request with conversation context
        const requestBody = {
          prompt,
          history, // Include full conversation history
        };

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
        
        // Add user message and assistant reply to history
        addToHistory(channelId, 'user', prompt);
        addToHistory(channelId, 'assistant', reply);

        const echoedQuestion = `**You**: ${prompt}`;
        const fullReply = `**Tetis**: ${reply}`;
        const maxDiscordMessageLength = 2000;
        const content = `${echoedQuestion}\n${fullReply}`.slice(0, maxDiscordMessageLength);

        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content },
        });
      } catch (error) {
        console.error('LLM request failed:', error);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: 'Tetis could not reach the backend right now. Please try again.' },
        });
      }
    }

    if (name === 'lobotomize') {
      const channelId = req.body.channel_id;
      conversationHistory.delete(channelId);
      
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: '🧠 Memory cleared. Tetis has been lobotomized for this channel.' },
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
