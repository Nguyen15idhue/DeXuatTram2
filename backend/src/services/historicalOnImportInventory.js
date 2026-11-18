const stockAffectingItems = items => items.filter(item => {
  if (![0, 1, '0', '1'].includes(item.historical_import)) {
    throw new Error('Không xác định được nguồn phiếu xuất để đối soát tồn kho');
  }
  if (item.stock_exempt !== undefined && ![0, 1, '0', '1', false, true].includes(item.stock_exempt)) {
    throw new Error('Không xác định được cơ chế tồn kho của phiếu xuất');
  }
  return Number(item.historical_import) === 0 && !Number(item.stock_exempt || 0);
});

const stockExemptSql = (alias) => `EXISTS(
  SELECT 1 FROM charging_station_fulfillment_events stock_event
  WHERE stock_event.charging_station_id=${alias}.charging_station_id
    AND stock_event.operation='SHIPPING_DIRECT_RECEIVE'
    AND JSON_EXTRACT(stock_event.payload,'$.export_id')=${alias}.id
    AND JSON_EXTRACT(stock_event.payload,'$.stock_exempt')=true
)`;

module.exports = { stockAffectingItems, stockExemptSql };
