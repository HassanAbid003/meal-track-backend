const Shift = require('../models/Shift');

// @desc    Get all shifts
// @route   GET /api/shifts
// @access  Private
const getShifts = async (req, res) => {
  try {
    let query = {};

    // Site Admin / Mess Keeper → only their own site's shifts
    if (req.user.role === 'site_admin' || req.user.role === 'mess_keeper') {
      query.site_id = req.user.site_id;
    }

    const shifts = await Shift.find(query).populate('site_id', 'code name');
    res.json(shifts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// @desc    Create a new shift (with duplicate check)
// @route   POST /api/shifts
// @access  Private
const createShift = async (req, res) => {
  const { name, start_time, end_time, status, site_id } = req.body;

  try {
    // 1. CHECK IF THIS SHIFT ALREADY EXISTS FOR THIS SITE
    const existingShift = await Shift.findOne({ name, site_id });

    if (existingShift) {
      // If it exists, UPDATE it instead of creating a new one!
      existingShift.start_time = start_time || existingShift.start_time;
      existingShift.end_time = end_time || existingShift.end_time;
      existingShift.status = status || existingShift.status;
      const updatedShift = await existingShift.save();
      
      // Return the UPDATED shift
      return res.status(200).json(updatedShift);
    }

    // 2. If NOT, create a brand new one
    const shift = await Shift.create({
      name,
      start_time,
      end_time,
      status,
      site_id,
    });

    res.status(201).json(shift);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Toggle a shift's status
// @route   PUT /api/shifts/:id/toggle
// @access  Private
const toggleShiftStatus = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);
    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    shift.status = shift.status === 'Active' ? 'Inactive' : 'Active';
    const updatedShift = await shift.save();
    res.json(updatedShift);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a shift
// @route   PUT /api/shifts/:id
// @access  Private
const updateShift = async (req, res) => {
  console.log('🔵 UPDATE SHIFT CALLED');
  console.log('🔵 Shift ID:', req.params.id);
  console.log('🔵 Request body:', req.body);
  
  try {
    const shift = await Shift.findById(req.params.id);
    
    console.log('🔵 Found shift:', shift);

    if (!shift) {
      console.log('🔴 Shift not found!');
      return res.status(404).json({ message: 'Shift not found' });
    }

    // Update only the fields that are provided
    if (req.body.start_time) {
      console.log('🟡 Updating start_time to:', req.body.start_time);
      shift.start_time = req.body.start_time;
    }
    
    if (req.body.end_time) {
      console.log('🟡 Updating end_time to:', req.body.end_time);
      shift.end_time = req.body.end_time;
    }
    
    if (req.body.name) {
      shift.name = req.body.name;
    }
    
    if (req.body.status) {
      shift.status = req.body.status;
    }

    console.log('🟡 Saving shift with:', shift);
    const updatedShift = await shift.save();
    console.log('✅ Shift updated:', updatedShift);
    
    res.json(updatedShift);
  } catch (error) {
    console.error('🔴 Error in updateShift:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a shift
// @route   DELETE /api/shifts/:id
// @access  Private
const deleteShift = async (req, res) => {
  try {
    const shift = await Shift.findById(req.params.id);

    if (!shift) {
      return res.status(404).json({ message: 'Shift not found' });
    }

    await shift.deleteOne();
    res.json({ message: 'Shift removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getShifts, createShift, toggleShiftStatus, updateShift, deleteShift };