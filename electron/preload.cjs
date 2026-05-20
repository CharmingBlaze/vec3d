const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('vec3dDesktop', {
  platform: process.platform,
});
