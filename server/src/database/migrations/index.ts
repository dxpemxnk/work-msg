import { initialSchemaMigration } from './001-initial-schema.js';
import { messageInteractionsMigration } from './002-message-interactions.js';
import { pinsAndForwardsMigration } from './003-pins-and-forwards.js';
import { pinNotificationLinksMigration } from './004-pin-notification-links.js';
import type { Migration } from './migration.types.js';

export const migrations: readonly Migration[] = [
  initialSchemaMigration,
  messageInteractionsMigration,
  pinsAndForwardsMigration,
  pinNotificationLinksMigration,
];
