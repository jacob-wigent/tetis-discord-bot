import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

const ASK_COMMAND = {
  name: 'ask',
  description: 'Ask Tetis a question',
  options: [
    {
      type: 3,
      name: 'prompt',
      description: 'Your question for Tetis',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const LOBOTOMIZE_COMMAND = {
  name: 'lobotomize',
  description: 'Clear Tetis memory for this channel',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const SUDO_COMMAND = {
  name: 'sudo',
  description: 'Ask Tetis a question as another user (admin only)',
  options: [
    {
      type: 3,
      name: 'user_id',
      description: 'The target user ID to impersonate',
      required: true,
    },
    {
      type: 3,
      name: 'prompt',
      description: 'Your question for Tetis',
      required: true,
    },
  ],
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [ASK_COMMAND, LOBOTOMIZE_COMMAND, SUDO_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
