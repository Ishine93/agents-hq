// Le site du QG sait qu'il tourne dans sa fenêtre application : son navigateur peut afficher tous les sites.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('qgApp', { navigateurComplet: true, electron: process.versions.electron });
