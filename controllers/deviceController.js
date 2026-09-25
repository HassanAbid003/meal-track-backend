const Device = require('../models/Device');

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

    // Enrich each device with isOnline + assignedTo
    const enriched = devices.map((d) => ({
      ...d.toObject(),
      isOnline: isDeviceOnline(d.lastPing),
      assignedTo: keeperBySerial[d.serial] || null,
    }));

    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Heartbeat from Mess Keeper mobile app
// @route   POST /api/devices/heartbeat
// @access  Private
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

// @desc    Get the device assigned to the current Mess Keeper
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

// @desc    Get devices not currently assigned to any Mess Keeper
// @route   GET /api/devices/unassigned
// @access  Private (Super Admin only)
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

module.exports = {
  getDevices,
  heartbeat,
  createDevice,
  updateDevice,
  deleteDevice,
  getMyDevice,
  getUnassignedDevices,
};