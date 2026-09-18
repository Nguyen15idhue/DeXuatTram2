require('dotenv').config();
const externalEventService = require('../src/services/externalEventService');

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i]] = process.argv[i + 1];
}

async function main() {
  const eventId = args['--event-id'] || `demo-${Date.now()}`;
  const event = (args['--event'] || '').toUpperCase();
  const proposalCode = args['--proposal'] || null;
  const contactCode = args['--contact'] || null;
  const note = args['--note'] || null;

  const result = await externalEventService.applyExternalEvent({
    eventId,
    event,
    proposalCode,
    contactCode,
    note,
    eventTime: new Date().toISOString(),
    actor: 'demo-script',
    source: 'script',
    ip: '127.0.0.1'
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(`[simulate-1office-event] loi: ${e.message}`); process.exit(1); });
