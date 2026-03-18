"use strict";
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const is = {
  dev: !electron.app.isPackaged
};
const platform = {
  isWindows: process.platform === "win32",
  isMacOS: process.platform === "darwin",
  isLinux: process.platform === "linux"
};
const electronApp = {
  setAppUserModelId(id) {
    if (platform.isWindows)
      electron.app.setAppUserModelId(is.dev ? process.execPath : id);
  },
  setAutoLaunch(auto) {
    if (platform.isLinux)
      return false;
    const isOpenAtLogin = () => {
      return electron.app.getLoginItemSettings().openAtLogin;
    };
    if (isOpenAtLogin() !== auto) {
      electron.app.setLoginItemSettings({
        openAtLogin: auto,
        path: process.execPath
      });
      return isOpenAtLogin() === auto;
    } else {
      return true;
    }
  },
  skipProxy() {
    return electron.session.defaultSession.setProxy({ mode: "direct" });
  }
};
const optimizer = {
  watchWindowShortcuts(window, shortcutOptions) {
    if (!window)
      return;
    const { webContents } = window;
    const { escToCloseWindow = false, zoom = false } = shortcutOptions || {};
    webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown") {
        if (!is.dev) {
          if (input.code === "KeyR" && (input.control || input.meta))
            event.preventDefault();
        } else {
          if (input.code === "F12") {
            if (webContents.isDevToolsOpened()) {
              webContents.closeDevTools();
            } else {
              webContents.openDevTools({ mode: "undocked" });
              console.log("Open dev tool...");
            }
          }
        }
        if (escToCloseWindow) {
          if (input.code === "Escape" && input.key !== "Process") {
            window.close();
            event.preventDefault();
          }
        }
        if (!zoom) {
          if (input.code === "Minus" && (input.control || input.meta))
            event.preventDefault();
          if (input.code === "Equal" && input.shift && (input.control || input.meta))
            event.preventDefault();
        }
      }
    });
  },
  registerFramelessWindowIpc() {
    electron.ipcMain.on("win:invoke", (event, action) => {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (action === "show") {
          win.show();
        } else if (action === "showInactive") {
          win.showInactive();
        } else if (action === "min") {
          win.minimize();
        } else if (action === "max") {
          const isMaximized = win.isMaximized();
          if (isMaximized) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        } else if (action === "close") {
          win.close();
        }
      }
    });
  }
};
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1500,
    height: 960,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.womensspecialists.prenatalchart");
  electron.app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  setupIPC();
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
function getPatientsDir() {
  const dir = path.join(os.homedir(), "Documents", "PrenatalChart", "patients");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
function setupIPC() {
  electron.ipcMain.handle("load-patients", async () => {
    const dir = getPatientsDir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    return files.map((filename) => {
      const filePath = path.join(dir, filename);
      const raw = fs.readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw);
      return {
        filename,
        lastName: data.lastName || "",
        firstName: data.firstName || "",
        mrn: data.mrn || "",
        dob: data.dob || ""
      };
    });
  });
  electron.ipcMain.handle("load-patient", async (_event, filename) => {
    const dir = getPatientsDir();
    const filePath = path.join(dir, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  });
  electron.ipcMain.handle("save-patient", async (_event, data) => {
    const dir = getPatientsDir();
    const lastName = (data.lastName || "Unknown").toLowerCase().replace(/[^a-z0-9]/g, "");
    const mrn = (data.mrn || "0000").replace(/[^a-z0-9]/gi, "");
    const filename = `${lastName}-${mrn}.json`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
    return { success: true, filename };
  });
  electron.ipcMain.handle("delete-patient", async (_event, filename) => {
    const filePath = path.join(getPatientsDir(), filename);
    const { response } = await electron.dialog.showMessageBox({
      type: "warning",
      buttons: ["Delete", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Delete Patient",
      message: `Delete ${filename}?`,
      detail: "This cannot be undone."
    });
    if (response === 0) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, reason: "cancelled" };
  });
  electron.ipcMain.handle("export-pdf", async (_event, html, lastName) => {
    const safeName = lastName.replace(/[^a-zA-Z0-9]/g, "") || "patient";
    const defaultPath = path.join(os.homedir(), "Desktop", `${safeName}-prenatal-record.pdf`);
    const { filePath } = await electron.dialog.showSaveDialog({
      defaultPath,
      filters: [{ name: "PDF Files", extensions: ["pdf"] }]
    });
    if (!filePath) return { success: false, reason: "cancelled" };
    const tmpPath = path.join(os.tmpdir(), `prenatal-export-${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html, "utf-8");
    const win = new electron.BrowserWindow({
      show: false,
      webPreferences: {
        javascript: true,
        nodeIntegration: false
      }
    });
    await win.loadFile(tmpPath);
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    const pdfBuffer = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: "Letter"
    });
    win.close();
    fs.unlinkSync(tmpPath);
    fs.writeFileSync(filePath, pdfBuffer);
    return { success: true, filePath };
  });
  electron.ipcMain.handle("print-document", async (_event, html) => {
    const tmpPath = path.join(os.tmpdir(), `prenatal-print-${Date.now()}.html`);
    fs.writeFileSync(tmpPath, html, "utf-8");
    const win = new electron.BrowserWindow({
      show: false,
      webPreferences: {
        javascript: true,
        nodeIntegration: false
      }
    });
    await win.loadFile(tmpPath);
    await new Promise((resolve) => setTimeout(resolve, 2e3));
    win.webContents.print(
      { printBackground: true, silent: false },
      (_success, _failureReason) => {
        win.close();
        fs.unlinkSync(tmpPath);
      }
    );
    return { success: true };
  });
}
