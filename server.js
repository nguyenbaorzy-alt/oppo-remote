// Root Server Entrypoint for Render / Cloud Hosting
// Automatically routes to server-dashboard/server.js
const path = require('path');
process.chdir(path.join(__dirname, 'server-dashboard'));
require('./server-dashboard/server.js');
