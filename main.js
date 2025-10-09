const { app, BrowserWindow, dialog, ipcMain, Menu } = require("electron")
const path = require("path")

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#000000",
    title: "Persona 5 Music Player",
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.loadFile("index.html")
}

app.whenReady().then(() => {
  // Remove default app menu
  Menu.setApplicationMenu(null)

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// IPC: open file dialog for audio
ipcMain.handle("dialog:openAudioFiles", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Load Songs",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "m4a", "flac"] }],
  })

  if (result.canceled) return []
  return result.filePaths || []
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
