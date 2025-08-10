// electron/ipcHandlers.ts

import { ipcMain, app } from "electron"
import { AppState } from "./main"

export function initializeIpcHandlers(appState: AppState): void {
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width: number; height: number }) => {
      if (width && height) {
        appState.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return appState.deleteScreenshot(path)
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await appState.takeScreenshot()
      const preview = await appState.getImagePreview(screenshotPath)
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      throw error
    }
  })

  ipcMain.handle("get-screenshots", async () => {
    console.log({ view: appState.getView() })
    try {
      let previews = []
      if (appState.getView() === "queue") {
        previews = await Promise.all(
          appState.getScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      } else {
        previews = await Promise.all(
          appState.getExtraScreenshotQueue().map(async (path) => ({
            path,
            preview: await appState.getImagePreview(path)
          }))
        )
      }
      previews.forEach((preview: any) => console.log(preview.path))
      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  ipcMain.handle("toggle-window", async () => {
    appState.toggleMainWindow()
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      appState.clearQueues()
      console.log("Screenshot queues have been cleared.")
      return { success: true }
    } catch (error: any) {
      console.error("Error resetting queues:", error)
      return { success: false, error: error.message }
    }
  })

  // Audio recording IPC handlers
  ipcMain.handle("start-audio-recording", async (event, deviceId?: string) => {
    try {
      console.log("Starting audio recording with device:", deviceId)
      const result = await appState.startAudioRecording(deviceId)
      return { success: result }
    } catch (error: any) {
      console.error("Error in start-audio-recording handler:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("stop-audio-recording", async () => {
    try {
      console.log("Stopping audio recording")
      const result = await appState.stopAudioRecording()
      return { success: true, result }
    } catch (error: any) {
      console.error("Error in stop-audio-recording handler:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("get-audio-recording-status", async () => {
    try {
      return { isRecording: appState.getIsAudioRecording() }
    } catch (error: any) {
      console.error("Error in get-audio-recording-status handler:", error)
      return { isRecording: false, error: error.message }
    }
  })

  ipcMain.handle("get-audio-devices", async () => {
    try {
      const devices = await appState.getAudioDevices()
      return { success: true, devices }
    } catch (error: any) {
      console.error("Error in get-audio-devices handler:", error)
      return { success: false, error: error.message }
    }
  })

  // IPC handler for analyzing audio from base64 data
  ipcMain.handle("analyze-audio-base64", async (event, data: string, mimeType: string) => {
    try {
      const result = await appState.processingHelper.processAudioBase64(data, mimeType)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-base64 handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing audio from file path
  ipcMain.handle("analyze-audio-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.processAudioFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-audio-file handler:", error)
      throw error
    }
  })

  // IPC handler for analyzing image from file path
  ipcMain.handle("analyze-image-file", async (event, path: string) => {
    try {
      const result = await appState.processingHelper.getLLMHelper().analyzeImageFile(path)
      return result
    } catch (error: any) {
      console.error("Error in analyze-image-file handler:", error)
      throw error
    }
  })

  ipcMain.handle("quit-app", () => {
    // Stop any ongoing audio recording before quitting
    if (appState.getIsAudioRecording()) {
      appState.stopAudioRecording()
    }
    app.quit()
  })
}
