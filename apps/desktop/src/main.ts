import { app, BrowserWindow, shell } from "electron"

const DEFAULT_SERVER_URL = "http://localhost:8787"
const serverUrl = process.env.MASTERHAND_URL ?? DEFAULT_SERVER_URL

app.setName("MasterHand")

function serverOrigin(): string | null {
  try {
    return new URL(serverUrl).origin
  } catch {
    return null
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 380,
    title: "MasterHand",
    backgroundColor: "#09090b",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const origin = serverOrigin()

  // Keep the renderer on the MasterHand origin; anything else opens externally.
  window.webContents.on("will-navigate", (event, url) => {
    try {
      if (origin && new URL(url).origin === origin) return
    } catch {
      // malformed URLs are denied below
    }
    event.preventDefault()
    void shell.openExternal(url)
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: "deny" }
  })

  void window.loadURL(serverUrl)
}

void app.whenReady().then(() => {
  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
