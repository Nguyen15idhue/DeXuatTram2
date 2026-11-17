const stockAffectingItems = items => items.filter(item => {
  if (![0, 1, '0', '1'].includes(item.historical_import)) {
    throw new Error('Không xác định được nguồn phiếu xuất để đối soát tồn kho');
  }
  return Number(item.historical_import) === 0;
});

module.exports = { stockAffectingItems };
