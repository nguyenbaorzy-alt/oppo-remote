// Fallback for Render when Root Directory is set to 'server-dashboard'
// and Start Command is mistakenly set to 'node server-dashboard/server.js'
const path = require('path');
process.chdir(path.join(__dirname, '..'));
require('../server.js');
