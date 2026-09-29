const Device = require('../models/Device');
const Employee = require('../models/Employee');
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

    // Look up Employees whose device_serial matches any returned device
    const serials = devices.map((d) => d.serial);
    const keepers = await Employee.find({
      device_serial: { $in: serials },
    }).select('name email empId device_serial');

    const keeperBySerial = {};
    keepers.forEach((k) => {
      keeperBySerial[k.device_serial] = {
        _id: k._id,
        name: k.name,
        email: k.email,
        empId: k.empId,
      };
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

// @desc    Create a new device (optionally assign an Employee as its Mess Keeper)
// @route   POST /api/devices
// @access  Private (Super Admin / Site Admin)
const createDevice = async (req, res) => {
  try {
    const { name, serial, site_id, status, mess_keeper_id } = req.body;

    let finalSiteId = site_id;
    if (req.user.role === 'site_admin' || req.user.role === 'mess_keeper') {
      finalSiteId = req.user.site_id;
    }

    // Optional: validate the employee before creating the device
    let keeper = null;

    if (mess_keeper_id) {
      keeper = await Employee.findById(mess_keeper_id);

      if (!keeper) {
        return res.status(404).json({ message: 'Employee not found' });
      }
      if (keeper.site_id?.toString() !== finalSiteId?.toString()) {
        return res.status(400).json({ message: 'Employee belongs to a different site' });
      }
      if (keeper.device_serial) {
        return res.status(400).json({
          message: `Employee already assigned to ${keeper.device_serial}`,
        });
      }
      if (keeper.status !== 'Active') {
        return res.status(400).json({ message: 'Employee is not active' });
      }
    }

    // Create the device
    const device = await Device.create({
      name,
      serial: serial?.toUpperCase?.(),
      site_id: finalSiteId,
      status: status || 'online',
    });

    // Assign the employee as Mess Keeper of this device
    if (keeper) {
      keeper.device_serial = device.serial;
      keeper.role = 'Mess Keeper';
      await keeper.save();
      console.log(`🔗 Device ${device.serial} assigned to ${keeper.name} (${keeper.empId})`);
    }

    const populated = await Device.findById(device._id).populate('site_id', 'name code');
    res.status(201).json({
      ...populated.toObject(),
      isOnline: isDeviceOnline(populated.lastPing),
      isPaired: false,
      pairedAt: null,
      assignedTo: keeper
        ? {
            _id: keeper._id,
            name: keeper.name,
            email: keeper.email,
            empId: keeper.empId,
          }
        : null,
    });
  } catch (error) {
    console.error('createDevice error:', error);

    // Handle duplicate serial (unique index on Device.serial)
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A device with this serial already exists' });
    }

    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a device (supports Mess Keeper reassignment + serial changes)
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

    const oldSerial = device.serial;
    const newSerial = (req.body.serial || device.serial).toUpperCase();

    // ─── Basic field updates ──────────────────────────────────────
    device.name = req.body.name || device.name;
    device.serial = newSerial;
    device.status = req.body.status || device.status;

    if (req.user.role === 'super_admin' && req.body.site_id) {
      device.site_id = req.body.site_id;
    }

    // ─── Mess Keeper reassignment ─────────────────────────────────
    const { mess_keeper_id } = req.body;
    const keeperWasProvided = mess_keeper_id !== undefined;

    if (keeperWasProvided) {
      // Find the currently assigned employee (if any)
      const currentKeeper = await Employee.findOne({ device_serial: oldSerial });

      const currentKeeperId = currentKeeper?._id?.toString() || null;
      const requestedKeeperId = mess_keeper_id ? String(mess_keeper_id) : null;

      if (currentKeeperId !== requestedKeeperId) {
        // Unassign the current keeper (role → Employee)
        if (currentKeeper) {
          currentKeeper.device_serial = null;
          currentKeeper.role = 'Employee';
          await currentKeeper.save();
          console.log(`🔓 ${currentKeeper.name} (${currentKeeper.empId}) unassigned from ${oldSerial}`);
        }

        // Assign the new keeper
        if (requestedKeeperId) {
          const newKeeper = await Employee.findById(requestedKeeperId);

          if (!newKeeper) {
            return res.status(404).json({ message: 'Employee not found' });
          }
          if (newKeeper.site_id?.toString() !== device.site_id?.toString()) {
            return res.status(400).json({ message: 'Employee belongs to a different site' });
          }
          if (newKeeper.device_serial && newKeeper.device_serial !== newSerial) {
            return res.status(400).json({
              message: `Employee already assigned to ${newKeeper.device_serial}`,
            });
          }
          if (newKeeper.status !== 'Active') {
            return res.status(400).json({ message: 'Employee is not active' });
          }

          newKeeper.device_serial = newSerial;
          newKeeper.role = 'Mess Keeper';
          await newKeeper.save();
          console.log(`🔗 ${newKeeper.name} (${newKeeper.empId}) assigned to ${newSerial}`);
        }
      }
    } else if (oldSerial !== newSerial) {
      // Serial changed but no keeper change requested —
      // keep the assignment consistent by updating the employee's device_serial
      await Employee.updateOne(
        { device_serial: oldSerial },
        { $set: { device_serial: newSerial } }
      );
      console.log(`🔄 Serial change: keeper of ${oldSerial} now points to ${newSerial}`);
    }

    const updated = await device.save();
    const populated = await Device.findById(updated._id).populate('site_id', 'name code');

    // Return the current assigned employee
    const keeper = await Employee.findOne({ device_serial: populated.serial })
      .select('name email empId device_serial');

    res.json({
      ...populated.toObject(),
      isOnline: isDeviceOnline(populated.lastPing),
      isPaired: !!populated.pairedAt,
      pairedAt: populated.pairedAt || null,
      assignedTo: keeper
        ? {
            _id: keeper._id,
            name: keeper.name,
            email: keeper.email,
            empId: keeper.empId,
          }
        : null,
    });
  } catch (error) {
    console.error('updateDevice error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A device with this serial already exists' });
    }
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

    // Unassign any employee first
    await Employee.updateMany(
      { device_serial: device.serial },
      { $set: { device_serial: null, role: 'Employee' } }
    );

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
    const assignedEmployees = await Employee.find({
      device_serial: { $ne: null },
    }).select('device_serial');

    const assignedSerials = assignedEmployees.map((e) => e.device_serial);

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
// Pairing endpoints
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

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    device.pairingCodeHash = codeHash;
    device.pairingCodeExpires = expiresAt;
    await device.save();

    console.log(`🔑 Pairing code generated for ${device.name} (expires ${expiresAt.toISOString()})`);

    res.json({ code, expiresAt: expiresAt.toISOString() });
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

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

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

// @desc    Unpair the calling device (self-revoke)
// @route   POST /api/devices/unpair-self
// @access  Private (pairing token auth only)
const unpairSelf = async (req, res) => {
  try {
    if (!req.device) {
      return res.status(401).json({ message: 'Not authenticated as a paired device' });
    }

    req.device.pairingTokenHash = null;
    req.device.pairedAt = null;
    req.device.pairingCodeHash = null;
    req.device.pairingCodeExpires = null;
    await req.device.save();

    console.log(`🔓 Device ${req.device.name} (${req.device.serial}) self-unpaired`);

    res.json({ message: 'Device unpaired' });
  } catch (error) {
    console.error('unpairSelf error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get active employees at a site who aren't assigned (or are assigned to a specific device)
// @route   GET /api/devices/available-mess-keepers?site_id=X[&include_serial=Y]
// @access  Private (requires devices page access)
const getAvailableMessKeepers = async (req, res) => {
  try {
    const { site_id, include_serial } = req.query;

    if (!site_id) {
      return res.status(400).json({ message: 'site_id is required' });
    }

    const query = {
      site_id,
      status: 'Active',
      $or: [
        { device_serial: null },
        { device_serial: { $exists: false } },
      ],
    };

    // When editing an existing device, include its current keeper so they can be preselected
    if (include_serial) {
      query.$or.push({ device_serial: include_serial });
    }

    const employees = await Employee.find(query)
      .select('name email empId device_serial site_id role');

    res.json(employees);
  } catch (error) {
    console.error('getAvailableMessKeepers error:', error);
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
  getAvailableMessKeepers,
  getUnassignedDevices,
  generatePairingCode,
  pairDevice,
  unpairDevice,
  unpairSelf,
};