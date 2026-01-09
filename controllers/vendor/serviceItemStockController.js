const ServiceItem = require('../../models/Item');
const ServiceItemStockLog = require('../../models/ServiceItemStockLog');

// Helper to get service item name
function getItemName(item) {
  if (!item) return '';
  const title = item.title;
  if (!title) return '';
  if (typeof title === 'string') return title;
  return title.en || title.nl || '';
}

// Create stock event for service items
exports.createStockEvent = async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    const { itemId, type, quantity, note } = req.body;

    if (!vendorId) return res.status(403).json({ error: 'Vendor access required' });
    if (!itemId || typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({ error: 'itemId and positive numeric quantity are required' });
    }
    if (!['checkin', 'checkout', 'missing', 'stockin'].includes(type)) {
      return res.status(400).json({ error: 'Invalid stock event type.' });
    }

    const item = await ServiceItem.findOne({ _id: itemId, vendor: vendorId });
    if (!item) return res.status(404).json({ error: 'Service item not found for this vendor' });

    // Apply quantity changes
    if (type === 'stockin') {
      item.stockQuantity = quantity;
    } else if (type === 'checkin') {
      item.stockQuantity += quantity;
    } else if (type === 'checkout' || type === 'missing') {
      if (item.stockQuantity < quantity) {
        return res.status(400).json({ error: 'Not enough stock.' });
      }
      item.stockQuantity -= quantity;
    }
    await item.save();

    const log = await ServiceItemStockLog.create({
      item: item._id,
      type,
      quantity,
      note,
      createdBy: req.user?._id
    });
    res.json({ success: true, log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Tabular GET endpoints for service items
exports.getStockTable = async (req, res) => {
  try {
    const { type } = req.params;
    if (!['checkin', 'checkout', 'missing', 'stockin'].includes(type)) {
      return res.status(400).json({ error: 'Invalid stock event type.' });
    }
    const vendorId = req.user?.id || null;
    console.log(vendorId, type, "vendorIdvendorIdvendorId");
    // logger.info(vendorId,type);

    // For 'stockin', list all items of this vendor with current quantity
    if (type === 'stockin' && vendorId) {
      const items = await ServiceItem.find({ vendor: vendorId }).select('_id title stockQuantity');
      const table = items.map((it, idx) => ({
        SNo: idx + 1,
        ItemID: it._id,
        Name: getItemName(it) || '(Unknown)',
        'In Stock (Quantity)': it.stockQuantity || 0
      }));
      return res.json({ table });
    }

    let logs = await ServiceItemStockLog.find({ type }).populate('item');
    console.log(vendorId, "vendorIdvendorIdvendorId");
    console.log(logs, "logslogslogs1111");
    if (vendorId) {
      logs = logs.filter((log) => log.item && String(log.item.vendor) === String(vendorId));
    }
    console.log(logs, "logslogslogs2222");

    const table = logs.map((log, idx) => {
      const item = log.item;
      const name = getItemName(item) || '(Unknown)';
      const itemId = item?._id || null;
      if (type === 'checkin') {
        return {
          SNo: idx + 1,
          ItemID: itemId,
          Name: name,
          'Check In (Quantity)': log.quantity,
          'Stock In (Date Time)': log.dateTime
        };
      } else if (type === 'checkout') {
        return {
          SNo: idx + 1,
          ItemID: itemId,
          Name: name,
          'Reserved for purchase': log.quantity,
          'Stock In (Date Time)': log.dateTime
        };
      } else if (type === 'missing') {
        return {
          SNo: idx + 1,
          ItemID: itemId,
          Name: name,
          'Missing Items': log.quantity,
          'Stock Out': log.dateTime
        };
      } else if (type === 'stockin') {
        return {
          SNo: idx + 1,
          ItemID: itemId,
          Name: name,
          'In Stock (Quantity)': log.quantity
        };
      }
    });
    res.json({ table });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Vendor: update item stock quantity directly (and log as stockin)
exports.updateItemQuantity = async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) return res.status(403).json({ error: 'Vendor access required' });

    const { itemId, quantity, note } = req.body;
    if (!itemId || typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ error: 'itemId and non-negative numeric quantity are required' });
    }

    const item = await ServiceItem.findOne({ _id: itemId, vendor: vendorId });
    if (!item) return res.status(404).json({ error: 'Service item not found for this vendor' });

    item.stockQuantity = quantity;
    await item.save();

    await ServiceItemStockLog.create({
      item: item._id,
      type: 'stockin',
      quantity,
      note: note || 'Manual quantity update',
      createdBy: req.user?._id
    });

    res.json({ success: true, itemId: item._id, quantity: item.stockQuantity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Return service item stock logs
exports.getStockLogs = async (req, res) => {
  try {
    const checkins = await ServiceItemStockLog.find({ type: { $in: ['checkin', 'stockin'] } }).populate('item').sort({ dateTime: -1 });
    const checkouts = await ServiceItemStockLog.find({ type: 'checkout' }).populate('item').sort({ dateTime: -1 });
    const missing = await ServiceItemStockLog.find({ type: 'missing' }).populate('item').sort({ dateTime: -1 });

    const mapLog = (log) => ({
      id: log._id,
      itemId: log.item?._id || null,
      itemTitle: getItemName(log.item),
      type: log.type,
      quantity: log.quantity,
      note: log.note,
      dateTime: log.dateTime,
      createdBy: log.createdBy
    });

    res.json({
      success: true,
      checkins: checkins.map(mapLog),
      checkouts: checkouts.map(mapLog),
      missing: missing.map(mapLog)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
