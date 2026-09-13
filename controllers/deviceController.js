const Device = require('../models/Device');

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
    res.json(devices);
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

    // Site Admin/Mess Keeper forced to their site
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
    res.status(201).json(populated);
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

    // Site Admin can only update devices in their site
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
    res.json(populated);
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

module.exports = { getDevices, createDevice, updateDevice, deleteDevice };