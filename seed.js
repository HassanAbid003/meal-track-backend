// const mongoose = require('mongoose');
// const User = require('./models/User');
// require('dotenv').config();

// const seedSuperAdmin = async () => {
//   try {
//     await mongoose.connect(process.env.MONGODB_URI);
//     console.log('✅ Connected to MongoDB for Seeding');

//     // Check if Super Admin already exists
//     const adminExists = await User.findOne({ email: 'admin@corp.com' });
//     if (adminExists) {
//       console.log('⚠️ Super Admin already exists.');
//       process.exit();
//     }

//     // Create the Super Admin
//     await User.create({
//       name: 'Super Admin',
//       email: 'admin@corp.com',
//       password: '123456',
//       role: 'super_admin',
//       site_id: null,
//       permissions: {
//         viewReports: true,
//         exportData: true,
//         viewAllSites: true
//       }
//     });

//     console.log('✅ Super Admin created successfully!');
//     console.log('   Email: admin@corp.com');
//     console.log('   Password: 123456');
//     process.exit();
//   } catch (error) {
//     console.error('❌ Error seeding Super Admin:', error.message);
//     process.exit(1);
//   }
// };

// seedSuperAdmin();

const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const seedSuperAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB for Seeding');

    // Check if Super Admin already exists
    const adminExists = await User.findOne({ email: 'admin@corp.com' });
    if (adminExists) {
      console.log('⚠️ Super Admin already exists.');
      process.exit();
    }

    // Create the Super Admin
    await User.create({
      name: 'Super Admin',
      email: 'admin@corp.com',
      password: '123456',
      role: 'super_admin',
      site_id: null,
      permissions: {
        // ✅ NEW: Page-based permissions
        pages: {
          dashboard: true,
          messSites: true,
          employees: true,
          shifts: true,
          devices: true,
          departments: true,
          reports: true,
        },
        viewAllSites: true,
        exportData: true,
      },
    });

    console.log('✅ Super Admin created successfully!');
    console.log('   Email: admin@corp.com');
    console.log('   Password: 123456');
    process.exit();
  } catch (error) {
    console.error('❌ Error seeding Super Admin:', error.message);
    process.exit(1);
  }
};

seedSuperAdmin();