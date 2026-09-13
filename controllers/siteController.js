const Site = require('../models/Site');

// @desc    Get all sites (filtered by role)
// @route   GET /api/sites
// @access  Private
const getSites = async (req, res) => {
  try {
    let query = {};

    // Site Admin / Mess Keeper → only their own site
    if (req.user.role === 'site_admin' || req.user.role === 'mess_keeper') {
      query._id = req.user.site_id;
    }

    const sites = await Site.find(query).sort({ createdAt: -1 });
    res.json(sites);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single site by ID
// @route   GET /api/sites/:id
// @access  Private
const getSiteById = async (req, res) => {
  try {
    const site = await Site.findById(req.params.id);
    if (site) {
      res.json(site);
    } else {
      res.status(404).json({ message: 'Site not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new site
// @route   POST /api/sites
// @access  Private (Super Admin only)
const createSite = async (req, res) => {
  const { code, name, location, manager, is_active } = req.body;

  try {
    const siteExists = await Site.findOne({ code });
    if (siteExists) {
      return res.status(400).json({ message: 'Site code already exists' });
    }

    const site = await Site.create({
      code,
      name,
      location,
      manager,
      is_active,
    });

    res.status(201).json(site);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update a site
// @route   PUT /api/sites/:id
// @access  Private (Super Admin only)
const updateSite = async (req, res) => {
  try {
    const site = await Site.findById(req.params.id);

    if (site) {
      site.code = req.body.code || site.code;
      site.name = req.body.name || site.name;
      site.location = req.body.location || site.location;
      site.manager = req.body.manager || site.manager;
      site.is_active = req.body.is_active !== undefined ? req.body.is_active : site.is_active;

      const updatedSite = await site.save();
      res.json(updatedSite);
    } else {
      res.status(404).json({ message: 'Site not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a site
// @route   DELETE /api/sites/:id
// @access  Private (Super Admin only)
const deleteSite = async (req, res) => {
  try {
    const site = await Site.findById(req.params.id);

    if (site) {
      await site.deleteOne();
      res.json({ message: 'Site removed' });
    } else {
      res.status(404).json({ message: 'Site not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getSites, getSiteById, createSite, updateSite, deleteSite };