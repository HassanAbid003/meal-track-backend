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
    const device = await Device.findOne({ serial: device_serial });
    if (!device) {
      console.log('❌ Device not found:', device_serial);
      return res.status(400).json({ 
        status: 'denied', 
        message: 'Device not found', 
        employee: null 
      });
    }

    // 2. Find the Employee by empId (CHANGED THIS LINE!)
    const employee = await Employee.findOne({ empId: barcode });
    
    if (!employee) {
      console.log('❌ Employee not found with empId:', barcode);
      
      await Scan.create({
        employee_id: null,
        device_id: device._id,
        site_id: device.site_id,
        status: 'denied',
        reason: 'Employee not found'
      }).catch(err => console.log('Could not create scan:', err.message));
      
      return res.status(404).json({ 
        status: 'denied', 
        message: 'Employee not found', 
        employee: null 
      });
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
        reason: 'Employee not registered'
      });
      
      return res.json({ 
        status: 'denied', 
        message: 'Employee not registered', 
        employee 
      });
    }

    // 4. Check if employee belongs to the same site as the device
    if (employee.site_id.toString() !== device.site_id.toString()) {
      console.log('❌ Site mismatch:', employee.site_id, 'vs', device.site_id);
      
      await Scan.create({
        employee_id: employee._id,
        device_id: device._id,
        site_id: device.site_id,
        status: 'denied',
        reason: 'Employee not assigned to this site'
      });
      
      return res.json({ 
        status: 'denied', 
        message: 'Employee not assigned to this site', 
        employee 
      });
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
        reason: 'Outside shift hours'
      });
      
      return res.json({ 
        status: 'denied', 
        message: 'Outside shift hours', 
        employee 
      });
    }

    console.log('✅ Active shift found:', activeShift.name);

    // 6. If all checks pass, ALLOWED!
    await Scan.create({
      employee_id: employee._id,
      device_id: device._id,
      site_id: device.site_id,
      status: 'allowed',
      reason: ''
    });

    console.log('✅ Scan allowed for:', employee.name);

    res.json({ 
      status: 'allowed', 
      message: 'Employee allowed to eat', 
      employee 
    });

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

module.exports = { verifyScan, getRecentScans };