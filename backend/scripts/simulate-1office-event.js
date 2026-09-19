require('dotenv').config();
const externalEventService = require('../src/services/externalEventService');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i]] = process.argv[i + 1];
}

const VALID_EVENTS = ['APPROVED', 'CONTRACT_SIGNED', 'CONTRACT_FAILED', 'CANCELLED'];

async function main() {
  const eventId = args['--event-id'] || `demo-${Date.now()}`;
  const event = (args['--event'] || '').toUpperCase();
  const proposalCode = args['--proposal'] || null;
  const contactCode = args['--contact'] || null;
  const note = args['--note'] || null;
  const eventTime = args['--event-time'] || new Date().toISOString();

  if (!event) {
    console.error('Thieu --event. Event hop le: ' + VALID_EVENTS.join(' | '));
    console.error('VD: node scripts/simulate-1office-event.js --event APPROVED --proposal TDT_NBH_0001 --note "demo"');
    process.exit(2);
  }
  if (!VALID_EVENTS.includes(event)) {
    console.error(`event khong hop le: ${event}. Hop le: ` + VALID_EVENTS.join(' | '));
    process.exit(2);
  }

  const result = await externalEventService.applyExternalEvent({
    eventId,
    event,
    proposalCode,
    contactCode,
    note,
    eventTime,
    actor: 'demo-script',
    source: 'script',
    ip: '127.0.0.1'
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(`[simulate-1office-event] loi: ${e.message}`); process.exit(1); });
