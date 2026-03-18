"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  loadPatients: () => electron.ipcRenderer.invoke("load-patients"),
  loadPatient: (filename) => electron.ipcRenderer.invoke("load-patient", filename),
  savePatient: (data) => electron.ipcRenderer.invoke("save-patient", data),
  deletePatient: (filename) => electron.ipcRenderer.invoke("delete-patient", filename),
  exportPdf: (html, lastName) => electron.ipcRenderer.invoke("export-pdf", html, lastName),
  printDocument: (html) => electron.ipcRenderer.invoke("print-document", html)
});
