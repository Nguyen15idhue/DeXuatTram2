const fail = message => Object.assign(new Error(message), { statusCode: 400 });

const buildPortions = (line) => {
  const keys = ['received', 'installed', 'accepted', 'on', 'accepted_on'];
  for (const key of keys) {
    if (!Number.isSafeInteger(line[key]) || line[key] < 0) throw fail(`${key}: số lượng không hợp lệ`);
  }
  const { received, installed, accepted, on, accepted_on: acceptedOn } = line;
  if (installed > received || accepted > installed || on > installed
    || acceptedOn > Math.min(accepted, on) || acceptedOn < accepted + on - installed) {
    throw fail('Số lượng lắp, nghiệm thu và ON không phù hợp');
  }
  const combinations = [
    { quantity: acceptedOn, installed: true, accepted: true, on: true },
    { quantity: on - acceptedOn, installed: true, accepted: false, on: true },
    { quantity: accepted - acceptedOn, installed: true, accepted: true, on: false },
    { quantity: installed - accepted - on + acceptedOn, installed: true, accepted: false, on: false },
    { quantity: received - installed, installed: false, accepted: false, on: false }
  ];
  return combinations.filter(item => item.quantity > 0).map(item => ({
    quantity: item.quantity,
    stage: item.on ? 'OPERATING' : item.installed ? 'CONFIGURING' : 'INSTALLING',
    sub_status: item.on ? 'ACTIVE' : item.installed ? 'NOT_CONFIGURED' : 'NOT_INSTALLED',
    installation_status: item.installed ? 'DONE' : 'NOT',
    acceptance_status: item.accepted ? 'PASSED' : 'NOT',
    on_quantity: item.on ? item.quantity : 0
  }));
};

module.exports = { buildPortions };
