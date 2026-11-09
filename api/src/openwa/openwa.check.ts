import {
  extractOpenWaMessageText,
  parseOpenWaSources,
} from './client';

const groupId = '120363012345678901@g.us';
const cutoff = Date.parse('2026-11-06T00:00:00Z');

assert(
  JSON.stringify(parseOpenWaSources('[" Grupo A ", "Grupo A", "120@g.us"]')) ===
    JSON.stringify(['Grupo A', '120@g.us']),
  'sources JSON parsing/deduplication failed',
);
assert(
  JSON.stringify(parseOpenWaSources('Grupo A, 120@g.us')) ===
    JSON.stringify(['Grupo A', '120@g.us']),
  'comma-separated sources parsing failed',
);
assert(
  extractOpenWaMessageText(
    { body: 'USD a 920', timestamp: 1794000000, chatId: groupId },
    groupId,
    cutoff,
  ) === 'USD a 920',
  'recent unix-seconds message was not kept',
);
assert(
  extractOpenWaMessageText(
    { text: 'USD a 920', timestamp: '2026-11-05T12:00:00Z', chatId: groupId },
    groupId,
    cutoff,
  ) === null,
  'old message was not filtered',
);
assert(
  extractOpenWaMessageText(
    { body: 'USD a 920', timestamp: 1794000000, chatId: groupId, fromMe: true },
    groupId,
    cutoff,
  ) === null,
  'outgoing message was not filtered',
);

console.log('openwa.check ok');

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}
