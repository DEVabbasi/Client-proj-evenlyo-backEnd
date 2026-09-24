const Listing = require('../../models/Listing');
const StockLog = require('../../models/StockLog');
const Booking = require('../../models/Booking');

// Helper to get listing name (null-safe and supports string/object title)
function getListingName(listing) {
  if (!listing) return '';
  const title = listing.title;
  if (!title) return '';
  if (typeof title === 'string') return title;
  return title.en || title.nl || '';
}

exports.createStockEvent = async (req, res) => {
  try {
    const { listingId, type, quantity, note, itemType } = req.body;
    if (!['checkin', 'checkout', 'missing', 'stockin', 'stockout'].includes(type)) {
      return res.status(400).json({ error: 'Invalid stock event type.' });
    }
    const listing = await Listing.findById(listingId);
    if (!listing) return res.status(404).json({ error: 'Listing not found.' });

    // Update quantity for stockin only
    if (type === 'stockin') {
      listing.quantity = quantity;
      await listing.save();
    }
    // For checkin, increase quantity
    if (type === 'checkin') {
      listing.quantity += quantity;
      await listing.save();
    }
    if (type === 'stockout') {
      listing.quantity -= quantity;
      await listing.save();
    }
    // For checkout or missing, decrease quantity
    if (type === 'checkout' || type === 'missing') {
      if (listing.quantity < quantity) {
        return res.status(400).json({ error: 'Not enough stock.' });
      }
      listing.quantity -= quantity;
      await listing.save();
    }
    const log = await StockLog.create({
      itemType,
      listing: listingId,
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

// Tabular GET endpoints
function getListingDisplayName(listing) {
  if (!listing) return { en: '', nl: '' };
  const title = listing.title;
  if (!title) return { en: '', nl: '' };
  if (typeof title === 'string') return { en: title, nl: title };
  return {
    en: title.en || title.nl || '',
    nl: title.nl || title.en || '',
  };
}

exports.getStockTable = async (req, res) => {
  try {
    const { type } = req.params;
    if (!['checkin', 'checkout', 'missing', 'stockin', 'stockout'].includes(type)) {
      return res.status(400).json({ error: 'Invalid stock event type.' });
    }
    const vendorId = req.user.id || null;
    console.log(req.user, type, "vendorIdvendorIdvendorId");

    // For 'stockin', list all listings of this vendor with current quantity
    if (type === 'stockin' && vendorId) {
      const listings = await Listing.find({ vendor: vendorId }).select('_id title quantity').sort({ createdAt: -1 })
      const table = listings.map((l, idx) => ({
        SNo: idx + 1,
        ListingID: l._id,
        Name: getListingDisplayName(l),
        'In Stock (Quantity)': l.quantity || 0
      }));
      return res.json({ table });
    }

    let logs = await StockLog.find({ type }).populate('listing').sort({ createdAt: -1 });
    // If vendor context, keep only logs for this vendor's listings
    if (vendorId) {
      logs = logs.filter((log) => log.listing && String(log.listing.vendor) === String(vendorId));
    }
    const table = logs.map((log, idx) => {
      const listing = log.listing;
      const name = getListingDisplayName(listing);
      const listingId = listing?._id || null;
      console.log(listingId, "listingIdlistingIdlistingIdlistingId");

      if (type === 'checkin') {
        return {
          SNo: idx + 1,
          ListingID: listingId,
          Name: name,
          'Check In (Quantity)': log.quantity,
          'Stock In (Date Time)': log.dateTime
        };
      }
      else if (type === 'checkout') {
        return {
          SNo: idx + 1,
          ListingID: listingId,
          Name: name,
          'Reserved for booking': log.quantity,
          'Stock In (Date Time)': log.dateTime
        };
      }
      else if (type === 'missing') {
        return {
          SNo: idx + 1,
          ListingID: listingId,
          Name: name,
          'Missing Items': log.quantity,
          'Stock Out': log.dateTime
        };
      }
      else if (type === 'stockin') {
        return {
          SNo: idx + 1,
          ListingID: listingId,
          Name: name,
          'In Stock (Quantity)': log.quantity
        };
      }
      else if (type === 'stockout') {
        return {
          SNo: idx + 1,
          ListingID: listingId,
          Name: name,
          'Out Stock (Quantity)': log.quantity
        };
      }
    });

    // For 'missing' type, also include bookings with status 'claim' for this vendor
    if (type === 'missing') {
      const vId = vendorId || req.user?.id;
      if (vId) {
        const claimBookings = await Booking.find({ status: 'claim', vendorId: vId })
          .populate('listingId')
          .sort({ updatedAt: -1 });
        const startIndex = table.length;
        const claimRows = claimBookings.map((b, i) => {
          const name = b.listingId
            ? getListingDisplayName(b.listingId)
            : getListingDisplayName({ title: b.listingDetails?.title });
          return {
            SNo: startIndex + i + 1,
            ListingID: b.listingId?._id || null,
            Name: name,
            'Stock Out': b.claimDetails?.claimedAt || b.updatedAt
          };
        });
        // Append claim rows to table
        table.push(...claimRows);
      }
    }
    res.json({ table });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Vendor: update listing quantity directly (and log as stockin)
exports.updateListingQuantity = async (req, res) => {
  try {
    const vendorId = req.user?.vendorId;
    if (!vendorId) return res.status(403).json({ error: 'Vendor access required' });

    const { listingId, quantity, note } = req.body;
    if (!listingId || typeof quantity !== 'number' || quantity < 0) {
      return res.status(400).json({ error: 'listingId and non-negative numeric quantity are required' });
    }

    const listing = await Listing.findOne({ _id: listingId, vendor: vendorId });
    if (!listing) return res.status(404).json({ error: 'Listing not found for this vendor' });

    listing.quantity = quantity;
    await listing.save();

    await StockLog.create({
      listing: listing._id,
      type: 'stockin',
      quantity,
      note: note || 'Manual quantity update',
      createdBy: req.user?._id
    });

    res.json({ success: true, listingId: listing._id, quantity: listing.quantity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Return stock logs separated into checkins and checkouts (and others)
exports.getStockLogs = async (req, res) => {
  try {
    // Optionally filter by vendor if needed in the future; for now return all logs
    const checkins = await StockLog.find({ type: { $in: ['checkin', 'stockin'] } }).populate('listing').sort({ dateTime: -1 });
    const checkouts = await StockLog.find({ type: 'checkout' }).populate('listing').sort({ dateTime: -1 });
    const missing = await StockLog.find({ type: 'missing' }).populate('listing').sort({ dateTime: -1 });

    // Map to a lighter object for API
    const mapLog = (log) => ({
      id: log._id,
      listingId: log.listing?._id || null,
      listingTitle: getListingDisplayName(log.listing),
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
    console.error('getStockLogs error', err);
    res.status(500).json({ success: false, message: err.message });
  }
};
