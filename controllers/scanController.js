const Employee = require('../models/Employee');
const Device = require('../models/Device');
const Scan = require('../models/Scan');
const Shift = require('../models/Shift');

// @desc    Verify an employee scan
// @route   POST /api/scan
// @access  Public (Mess Keeper / Scanner device)
const verifyScan = async (req, res) => {
  const { barcode, device_serial } = req.body;

  console.log('🔵 Scan request:', { barcode, device_serial });

  try {
    // 1. Find the Device
    const device = await Device.findOne({ serial: device_serial }).populate('site_id', 'name code');

    if (!device) {
      console.log('❌ Device not found:', device_serial);
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
    const employee = await Employee.findOne({ empId: barcode });

    if (!employee) {
      console.log('❌ Employee not found with empId:', barcode);

      await Scan.create({
        employee_id: null,
        device_id: device._id,
        site_id: device.site_id,
        status: 'denied',
        reason: 'Employee not found',
        shift: null,
      }).catch(err => console.log('Could not create scan:', err.message));

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
        status: 'denied',
        reason: 'Employee not assigned to this site',
        shift: null,
      });

      return res.json(buildResponse('denied', 'Employee not assigned to this site', employee));
    }

    // 5. Check if current time is within an active shift
    const currentTime = new Date().toTimeString().slice(0, 5);
    console.log('🕐 Current time:', currentTime);

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
        status: 'denied',
        reason: `Not assigned to ${activeShift.name} shift`,
        shift: activeShift.name,
      });

      return res.json(
        buildResponse('denied', `Not assigned to ${activeShift.name} shift`, employee)
      );
    }

    console.log('✅ Employee assigned to shift:', activeShift.name);

    // 7. If all checks pass, ALLOWED!
    await Scan.create({
      employee_id: employee._id,
      device_id: device._id,
      site_id: device.site_id,
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
// @access  Private (Super Admin / Site Admin)
const getRecentScans = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === 'site_admin') {
      query.site_id = req.user.site_id;
    }

    const scans = await Scan.find(query)
      .populate('employee_id', 'name empId')
      .populate('device_id', 'name serial')
      .sort({ createdAt: -1 })
      .limit(20);

    console.log(`✅ Found ${scans.length} recent scans`);
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

    // Build 7-day range starting 6 days ago (in Pakistan time)
    // Using UTC-based math on the current moment, then bucketing by PKT
    const now = new Date();
    // "Today" in Pakistan — expressed as a plain YYYY-MM-DD string
    const todayPKT = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now); // e.g. "2026-09-19"

    // Build the list of the last 7 days as YYYY-MM-DD strings (Pakistan time)
    // We anchor to today PKT and walk backwards.
    const bucketKeys = [];
    for (let i = days - 1; i >= 0; i--) {
      // Use a Date at noon UTC so that shifting days doesn't accidentally land on a different day
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

    // Earliest day in the window (as a Date at 00:00 PKT)
    // We approximate by taking the earliest key and shifting back 5 hours (UTC+5)
    const earliestKey = bucketKeys[0];
    // PKT midnight = 19:00 UTC the previous day
    const sinceUTC = new Date(`${earliestKey}T00:00:00+05:00`);

    const matchQuery = {
      createdAt: { $gte: sinceUTC },
      status: 'allowed',
    };

    if (req.user.role === 'site_admin') {
      matchQuery.site_id = req.user.site_id;
    }

    // Aggregate by Pakistan-local date + shift
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

    // Initialize all buckets with zeros
    const buckets = {};
    bucketKeys.forEach((key) => {
      buckets[key] = { breakfast: 0, lunch: 0, dinner: 0 };
    });

    // Populate counts from aggregation
    raw.forEach((row) => {
      const date = row._id.date;
      const shift = row._id.shift;
      if (!buckets[date]) return; // out of window
      if (shift === 'Breakfast') buckets[date].breakfast = row.count;
      else if (shift === 'Lunch') buckets[date].lunch = row.count;
      else if (shift === 'Dinner') buckets[date].dinner = row.count;
    });

    // Return ordered array (oldest → newest)
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