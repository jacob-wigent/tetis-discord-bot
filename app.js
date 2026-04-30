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
 * Format conversation history into a context string
 */
function formatHistoryContext(history) {
  return history
    .map((msg) => `${msg.role === 'user' ? 'User' : 'Tetis'}: ${msg.content}`)
    .join('\n');
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
        console.log(`\n[Channel ${channelId}] User Question:`, prompt);

        // Format conversation context and include in prompt
        const historyContext = formatHistoryContext(history);
        const enhancedPrompt = historyContext 
          ? `Conversation history:\n${historyContext}\n\nNew question: ${prompt}`
          : prompt;

        // Prepare the request with conversation context
        const requestBody = {
          prompt: enhancedPrompt,
          history, // Include full conversation history array as well
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
        console.log(`[Channel ${channelId}] Tetis Answer:`, reply);
        
        // Add user message and assistant reply to history
        addToHistory(channelId, 'user', prompt);
        addToHistory(channelId, 'assistant', reply);
        console.log(`[Channel ${channelId}] History length after update: ${getConversationHistory(channelId).length}\n`);

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
