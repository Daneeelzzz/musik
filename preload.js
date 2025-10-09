const { contextBridge, ipcRenderer } = require("electron")
const { pathToFileURL } = require("url")

contextBridge.exposeInMainWorld("electronAPI", {
  openAudioFiles: async () => {
    const paths = await ipcRenderer.invoke("dialog:openAudioFiles")
    return paths
  },
  toFileURL: (absPath) => {
    try {
      return pathToFileURL(absPath).href
    } catch {
      return absPath
    }
  },
})
