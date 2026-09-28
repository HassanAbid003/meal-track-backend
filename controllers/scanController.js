const Employee = require('../models/Employee');
const Device = require('../models/Device');
const Scan = require('../models/Scan');
const Shift = require('../models/Shift');

// ─── Helpers ─────────────────────────────────────────────────────
/**
 * Normalize a barcode coming off the scanner.
 * Handles common misreads:
 *  - Trailing \r or \n from the scanner's terminator
 *  - Leading/trailing whitespace
 *  - Control characters (\x00-\x1F, \x7F)
 *  - Case inconsistencies
 */
function normalizeBarcode(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\x00-\x1F\x7F]/g, '') // strip control chars including \r \n \t
    .trim()
    .toUpperCase();
}

// @desc    Verify an employee scan
// @route   POST /api/scan
// @access  Public (Mess Keeper / Scanner device)
const verifyScan = async (req, res) => {
  const { barcode: rawBarcode, device_serial } = req.body;

  const barcode = normalizeBarcode(rawBarcode);
  const serialToLookup = device_serial || req.device?.serial;
  const scanningUserId = req.user?._id || null;

  console.log('🔵 Scan request:', {
    raw: JSON.stringify(rawBarcode),
    normalized: JSON.stringify(barcode),
    device_serial,
    serialToLookup,
    scanningUserId,
  });

  try {
    // 0. Require a device serial (either from body or req.device)
    if (!serialToLookup) {
      return res.status(400).json({
        status: 'denied',
        message: 'device_serial is required',
        employee: null,
        site: null,
        timestamp: new Date().toISOString(),
      });
    }

    // 0b. Require a non-empty barcode
    if (!barcode) {
      return res.status(400).json({
        status: 'denied',
        message: 'Empty barcode',
        employee: null,
        site: null,
        timestamp: new Date().toISOString(),
      });
    }

    // 1. Find the Device
    const device = await Device.findOne({ serial: serialToLookup }).populate('site_id', 'name code');

    if (!device) {
      console.log('❌ Device not found:', serialToLookup);
      return res.status(400).json({
        status: 'denied',
        message: 'Device not found',
        employee: null,
        site: null,
        timestamp: new Date().toISOString(),
      });
    }

    const buildResponse = (status, message, employee) => ({
      status,
      message,
      employee: employee
        ? {
            _id: employee._id,
            name: employee.name,
            empId: employee.empId,
            department: employee.department,
            image: employee.image || null,
          }
        : null,
      site: device.site_id
        ? {
            _id: device.site_id._id,
            code: device.site_id.code,
            name: device.site_id.name,
          }
        : null,
      device: {
        _id: device._id,
        name: device.name,
        serial: device.serial,
      },
      timestamp: new Date().toISOString(),
    });

    // 2. Find the Employee by empId
    // Use a case-insensitive exact match to tolerate minor inconsistencies
    const employee = await Employee.findOne({
      empId: { $regex: `^${barcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    });

    if (!employee) {
      console.log('❌ Employee not found with empId:', barcode);

      // Do NOT create a Scan row for unreadable / unknown barcodes.
      // These are scanner misreads, not real scan attempts.
      // Logging them would clutter history and inflate counts.

      return res.status(404).json(buildResponse('denied', 'Employee not found', null));
    }

    console.log('✅ Employee found:', employee.name, employee.empId);

    // 3. Check if employee is registered
    if (!employee.is_registered) {
      console.log('❌ Employee not registered:', employee.name);

      await Scan.create({
        employee_id: employee._id,
        device_id: device._id,
        site_id: device.site_id,
        user_id: scanningUserId,
        barcode,
        status: 'denied',
        reason: 'Employee not registered',
        shift: null,
      });

      return res.json(buildResponse('denied', 'Employee not registered', employee));
    }

    // 4. Check if employee belongs to the same site as the device
    if (employee.site_id.toString() !== device.site_id._id.toString()) {
      console.log('❌ Site mismatch:', employee.site_id, 'vs', device.site_id._id);

      await Scan.create({
        employee_id: employee._id,
        device_id: device._id,
        site_id: device.site_id,
        user_id: scanningUserId,
        barcode,
        status: 'denied',
        reason: 'Employee not assigned to this site',
        shift: null,
      });

      return res.json(buildResponse('denied', 'Employee not assigned to this site', employee));
    }

    // 5. Check if current time is within an active shift (using Pakistan time)
    const currentTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    console.log('🕐 Current time (PKT):', currentTime);

    const activeShift = await Shift.findOne({
      site_id: device.site_id,
      status: 'Active',
      start_time: { $lte: currentTime },
      end_time: { $gte: currentTime },
    });

    if (!activeShift) {
      console.log('❌ No active shift found at:', currentTime);

      await Scan.create({
        employee_id: employee._id,
        device_id: device._id,
        site_id: device.site_id,
        user_id: scanningUserId,
        barcode,
        status: 'denied',
        reason: 'Outside shift hours',
        shift: null,
      });

      return res.json(buildResponse('denied', 'Outside shift hours', employee));
    }

    console.log('✅ Active shift found:', activeShift.name);

    // 6. Check if the employee is assigned to this shift
    const employeeShifts = Array.isArray(employee.shifts) ? employee.shifts : [];

    if (!employeeShifts.includes(activeShift.name)) {
      console.log('❌ Employee not assigned to this shift:', employee.name, '| shift:', activeShift.name);

      await Scan.create({
        employee_id: employee._id,
        device_id: device._id,
        site_id: device.site_id,
        user_id: scanningUserId,
        barcode,
        status: 'denied',
        reason: `Not assigned to ${activeShift.name} shift`,
        shift: activeShift.name,
      });

      return res.json(
        buildResponse('denied', `Not assigned to ${activeShift.name} shift`, employee)
      );
    }

    console.log('✅ Employee assigned to shift:', activeShift.name);

    // 7. Duplicate check — has the employee already eaten during this shift today?
    const startOfDayPKT = new Date(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()) + 'T00:00:00+05:00'
    );

    const existingScan = await Scan.findOne({
      employee_id: employee._id,
      site_id: device.site_id,
      shift: activeShift.name,
      status: 'allowed',
      createdAt: { $gte: startOfDayPKT },
    });

    if (existingScan) {
      console.log('❌ Duplicate scan:', employee.name, '| shift:', activeShift.name);

      await Scan.create({
        employee_id: employee._id,
        device_id: device._id,
        site_id: device.site_id,
        user_id: scanningUserId,
        barcode,
        status: 'denied',
        reason: `Already marked for ${activeShift.name}`,
        shift: activeShift.name,
      });

      return res.json(
        buildResponse('denied', `Already marked for ${activeShift.name}`, employee)
      );
    }

    // 8. If all checks pass, ALLOWED!
    await Scan.create({
      employee_id: employee._id,
      device_id: device._id,
      site_id: device.site_id,
      user_id: scanningUserId,
      barcode,
      status: 'allowed',
      reason: '',
      shift: activeShift.name,
    });

    console.log('✅ Scan allowed for:', employee.name);

    res.json(buildResponse('allowed', 'Employee allowed to eat', employee));

  } catch (error) {
    console.error('🔴 Error in verifyScan:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get recent scans
// @route   GET /api/scan/recent
// @access  Private (Super Admin / Site Admin / Mess Keeper / Paired Device)
const getRecentScans = async (req, res) => {
  try {
    const { device_serial, limit } = req.query;

    // Only return scans that were matched to a real employee.
    // Misread / unknown-employee scans are not logged, but this is
    // a defensive filter for any legacy rows.
    let query = { employee_id: { $ne: null } };

    // Role-based site filter — only applies when authenticated as a user.
    // When auth comes from a pairing token, req.user is undefined — skip.
    if (req.user && (req.user.role === 'site_admin' || req.user.role === 'mess_keeper')) {
      query.site_id = req.user.site_id;
    }

    // If device_serial provided, filter to just that device
    if (device_serial) {
      const device = await Device.findOne({ serial: device_serial }).select('_id');
      if (!device) {
        return res.status(404).json({ message: 'Device not found' });
      }
      query.device_id = device._id;
    }

    // Limit: default 100, max 500
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);

    const scans = await Scan.find(query)
      .populate('employee_id', 'name empId department image')
      .populate('device_id', 'name serial')
      .populate('site_id', 'name code')
      .populate('user_id', 'name email')
      .sort({ createdAt: -1 })
      .limit(parsedLimit);

    console.log(`✅ Found ${scans.length} recent scans (device_serial=${device_serial || 'any'})`);
    res.json(scans);
  } catch (error) {
    console.error('🔴 Error in getRecentScans:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get weekly scan statistics (last 7 days, grouped by shift)
// @route   GET /api/scan/stats/weekly
// @access  Private (Super Admin / Site Admin)
const getWeeklyStats = async (req, res) => {
  try {
    const TZ = 'Asia/Karachi';
    const days = 7;

    const now = new Date();
    const todayPKT = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);

    const bucketKeys = [];
    for (let i = days - 1; i >= 0; i--) {
      const anchor = new Date(`${todayPKT}T12:00:00Z`);
      anchor.setUTCDate(anchor.getUTCDate() - i);
      const key = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(anchor);
      bucketKeys.push(key);
    }

    const earliestKey = bucketKeys[0];
    const sinceUTC = new Date(`${earliestKey}T00:00:00+05:00`);

    const matchQuery = {
      createdAt: { $gte: sinceUTC },
      status: 'allowed',
    };

    // Role-based site filter — guard against missing req.user
    if (req.user && req.user.role === 'site_admin') {
      matchQuery.site_id = req.user.site_id;
    }

    const pipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
            shift: '$shift',
          },
          count: { $sum: 1 },
        },
      },
    ];

    const raw = await Scan.aggregate(pipeline);

    const buckets = {};
    bucketKeys.forEach((key) => {
      buckets[key] = { breakfast: 0, lunch: 0, dinner: 0 };
    });

    raw.forEach((row) => {
      const date = row._id.date;
      const shift = row._id.shift;
      if (!buckets[date]) return;
      if (shift === 'Breakfast') buckets[date].breakfast = row.count;
      else if (shift === 'Lunch') buckets[date].lunch = row.count;
      else if (shift === 'Dinner') buckets[date].dinner = row.count;
    });

    const result = Object.entries(buckets).map(([date, counts]) => ({
      date,
      ...counts,
    }));

    console.log(`📊 Weekly stats (${days}d, TZ=${TZ}):`, result);
    res.json(result);
  } catch (error) {
    console.error('🔴 Error in getWeeklyStats:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = { verifyScan, getRecentScans, getWeeklyStats };