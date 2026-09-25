const Device = require('../models/Device');
const crypto = require('crypto');

// Online threshold: 60 seconds
const ONLINE_THRESHOLD_MS = 60 * 1000;

// Helper: check if a device is online based on lastPing
function isDeviceOnline(lastPing) {
  if (!lastPing) return false;
  return Date.now() - new Date(lastPing).getTime() < ONLINE_THRESHOLD_MS;
}

// @desc    Get all devices
// @route   GET /api/devices
// @access  Private
const getDevices = async (req, res) => {
  try {
    let query = {};

    // Site Admin/Mess Keeper sees only their site's devices
    if (req.user.role === 'site_admin' || req.user.role === 'mess_keeper') {
      query.site_id = req.user.site_id;
    }

    const devices = await Device.find(query).populate('site_id', 'name code');

    // Look up Mess Keepers whose device_serial matches any returned device
    const User = require('../models/User');
    const serials = devices.map((d) => d.serial);
    const keepers = await User.find({
      role: 'mess_keeper',
      device_serial: { $in: serials },
    }).select('name email device_serial');

    const keeperBySerial = {};
    keepers.forEach((k) => {
      keeperBySerial[k.device_serial] = { name: k.name, email: k.email };
    });

    // Enrich each device with isOnline + assignedTo + isPaired + pairedAt
    const enriched = devices.map((d) => ({
      ...d.toObject(),
      isOnline: isDeviceOnline(d.lastPing),
      assignedTo: keeperBySerial[d.serial] || null,
      isPaired: !!d.pairedAt,
      pairedAt: d.pairedAt || null,
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Heartbeat from paired tablet
// @route   POST /api/devices/heartbeat
// @access  Private (any auth)
const heartbeat = async (req, res) => {
  try {
    const { device_serial } = req.body;

    if (!device_serial) {
      return res.status(400).json({ message: 'device_serial is required' });
    }

    const device = await Device.findOneAndUpdate(
      { serial: device_serial },
      { lastPing: new Date(), status: 'online' },
      { new: true }
    );

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    res.json({ ok: true, lastPing: device.lastPing });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new device
// @route   POST /api/devices
// @access  Private (Super Admin / Site Admin)
const createDevice = async (req, res) => {
  try {
    const { name, serial, site_id, status } = req.body;

    let finalSiteId = site_id;
    if (req.user.role === 'site_admin' || req.user.role === 'mess_keeper') {
      finalSiteId = req.user.site_id;
    }

    const device = await Device.create({
      name,
      serial,
      site_id: finalSiteId,
      status: status || 'online',
    });

    const populated = await Device.findById(device._id).populate('site_id', 'name code');
    res.status(201).json({
      ...populated.toObject(),
      isOnline: isDeviceOnline(populated.lastPing),
      isPaired: false,
      pairedAt: null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a device
// @route   PUT /api/devices/:id
// @access  Private (Super Admin / Site Admin)
const updateDevice = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    if (req.user.role === 'site_admin' || req.user.role === 'mess_keeper') {
      if (device.site_id.toString() !== req.user.site_id.toString()) {
        return res.status(403).json({ message: 'Access denied: Device not in your site' });
      }
    }

    device.name = req.body.name || device.name;
    device.serial = req.body.serial || device.serial;
    device.status = req.body.status || device.status;

    if (req.user.role === 'super_admin' && req.body.site_id) {
      device.site_id = req.body.site_id;
    }

    const updated = await device.save();
    const populated = await Device.findById(updated._id).populate('site_id', 'name code');
    res.json({
      ...populated.toObject(),
      isOnline: isDeviceOnline(populated.lastPing),
      isPaired: !!populated.pairedAt,
      pairedAt: populated.pairedAt || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a device
// @route   DELETE /api/devices/:id
// @access  Private (Super Admin only)
const deleteDevice = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);

    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied: Super Admin only' });
    }

    await device.deleteOne();
    res.json({ message: 'Device removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get the device assigned to the current Mess Keeper (legacy)
// @route   GET /api/devices/my-device
// @access  Private (Mess Keeper only)
const getMyDevice = async (req, res) => {
  try {
    if (req.user.role !== 'mess_keeper') {
      return res.status(403).json({ message: 'Only Mess Keepers have an assigned device' });
    }

    if (!req.user.device_serial) {
      return res.status(404).json({ message: 'No device assigned. Contact your admin.' });
    }

    const device = await Device.findOne({ serial: req.user.device_serial })
      .populate('site_id', 'name code');

    if (!device) {
      return res.status(404).json({ message: 'Assigned device not found in system' });
    }

    res.json({
      ...device.toObject(),
      isOnline: isDeviceOnline(device.lastPing),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get devices not currently assigned to any Mess Keeper (legacy)
// @route   GET /api/devices/unassigned
// @access  Private
const getUnassignedDevices = async (req, res) => {
  try {
    const User = require('../models/User');

    const assignedUsers = await User.find({
      role: 'mess_keeper',
      device_serial: { $ne: null },
    }).select('device_serial');

    const assignedSerials = assignedUsers.map((u) => u.device_serial);

    const devices = await Device.find({ serial: { $nin: assignedSerials } })
      .populate('site_id', 'name code');

    const enriched = devices.map((d) => ({
      ...d.toObject(),
      isOnline: isDeviceOnline(d.lastPing),
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// NEW: Pairing endpoints
// ============================================================

// @desc    Generate a 6-digit pairing code for a device
// @route   POST /api/devices/:id/pairing-code
// @access  Private (requires devices page access)
const generatePairingCode = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    // Generate 6-digit numeric code: 100000-999999
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // Hash it
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    // 10-minute expiry
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    device.pairingCodeHash = codeHash;
    device.pairingCodeExpires = expiresAt;
    await device.save();

    console.log(`🔑 Pairing code generated for ${device.name} (expires ${expiresAt.toISOString()})`);

    res.json({
      code,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('generatePairingCode error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Exchange a pairing code for a long-lived pairing token
// @route   POST /api/devices/pair
// @access  Public
const pairDevice = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Invalid code format' });
    }

    const codeHash = crypto.createHash('sha256').update(code).digest('hex');

    const device = await Device.findOne({
      pairingCodeHash: codeHash,
      pairingCodeExpires: { $gt: new Date() },
    }).populate('site_id', 'name code');

    if (!device) {
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    // Generate 64-char hex token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Replace any existing pairing (re-pairing kicks old tablet out)
    device.pairingTokenHash = tokenHash;
    device.pairedAt = new Date();
    device.pairingCodeHash = null;
    device.pairingCodeExpires = null;
    await device.save();

    console.log(`✅ Device ${device.name} paired at ${device.pairedAt.toISOString()}`);

    res.json({
      token,
      device: {
        _id: device._id,
        name: device.name,
        serial: device.serial,
        site: device.site_id
          ? {
              _id: device.site_id._id,
              code: device.site_id.code,
              name: device.site_id.name,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('pairDevice error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Unpair the tablet from a device
// @route   POST /api/devices/:id/unpair
// @access  Private (requires devices page access)
const unpairDevice = async (req, res) => {
  try {
    const device = await Device.findById(req.params.id);
    if (!device) {
      return res.status(404).json({ message: 'Device not found' });
    }

    device.pairingTokenHash = null;
    device.pairedAt = null;
    device.pairingCodeHash = null;
    device.pairingCodeExpires = null;
    await device.save();

    console.log(`🔓 Device ${device.name} unpaired`);

    res.json({ message: 'Device unpaired', device });
  } catch (error) {
    console.error('unpairDevice error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getDevices,
  heartbeat,
  createDevice,
  updateDevice,
  deleteDevice,
  getMyDevice,
  getUnassignedDevices,
  generatePairingCode,
  pairDevice,
  unpairDevice,
};