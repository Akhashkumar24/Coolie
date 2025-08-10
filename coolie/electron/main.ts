// electron/main.ts
import { app, BrowserWindow } from "electron"
import { initializeIpcHandlers } from "./ipcHandlers"
import { WindowHelper } from "./WindowHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { ProcessingHelper } from "./ProcessingHelper"
import { AudioCapture } from "./AudioCapture"

export class AppState {
  private static instance: AppState | null = null

  private windowHelper: WindowHelper
  private screenshotHelper: ScreenshotHelper
  public shortcutsHelper: ShortcutsHelper
  public processingHelper: ProcessingHelper
  public audioCapture: AudioCapture

  // View management
  private view: "queue" | "solutions" = "queue"

  private problemInfo: {
    problem_statement: string
    input_format: Record<string, any>
    output_format: Record<string, any>
    constraints: Array<Record<string, any>>
    test_cases: Array<Record<string, any>>
  } | null = null // Allow null

  private hasDebugged: boolean = false
  private isAudioRecording: boolean = false

  // Processing events
  public readonly PROCESSING_EVENTS = {
    //global states
    UNAUTHORIZED: "procesing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",

    //states for generating the initial solution
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",

    //states for processing the debugging
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error",

    // Audio recording events
    AUDIO_RECORDING_START: "audio-recording-start",
    AUDIO_RECORDING_STOP: "audio-recording-stop",
    AUDIO_TRANSCRIPTION_READY: "audio-transcription-ready"
  } as const

  constructor() {
    // Initialize WindowHelper with this
    this.windowHelper = new WindowHelper(this)

    // Initialize ScreenshotHelper
    this.screenshotHelper = new ScreenshotHelper(this.view)

    // Initialize ProcessingHelper
    this.processingHelper = new ProcessingHelper(this)

    // Initialize ShortcutsHelper
    this.shortcutsHelper = new ShortcutsHelper(this)

    // Initialize AudioCapture
    this.audioCapture = new AudioCapture()
  }

  public static getInstance(): AppState {
    if (!AppState.instance) {
      AppState.instance = new AppState()
    }
    return AppState.instance
  }

  // Getters and Setters
  public getMainWindow(): BrowserWindow | null {
    return this.windowHelper.getMainWindow()
  }

  public getView(): "queue" | "solutions" {
    return this.view
  }

  public setView(view: "queue" | "solutions"): void {
    this.view = view
    this.screenshotHelper.setView(view)
  }

  public isVisible(): boolean {
    return this.windowHelper.isVisible()
  }

  public getScreenshotHelper(): ScreenshotHelper {
    return this.screenshotHelper
  }

  public getProblemInfo(): any {
    return this.problemInfo
  }

  public setProblemInfo(problemInfo: any): void {
    this.problemInfo = problemInfo
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotHelper.getScreenshotQueue()
  }

  public getExtraScreenshotQueue(): string[] {
    return this.screenshotHelper.getExtraScreenshotQueue()
  }

  // Audio recording methods
  public async startAudioRecording(deviceId?: string): Promise<boolean> {
    try {
      if (this.isAudioRecording) {
        console.warn('Audio recording already in progress')
        return false
      }

      const result = await this.audioCapture.startMixedRecording(deviceId)
      if (result) {
        this.isAudioRecording = true
        const mainWindow = this.getMainWindow()
        if (mainWindow) {
          mainWindow.webContents.send(this.PROCESSING_EVENTS.AUDIO_RECORDING_START)
        }
        return true
      }
      return false
    } catch (error) {
      console.error('Error starting audio recording:', error)
      return false
    }
  }

  public async stopAudioRecording(): Promise<string | null> {
    try {
      if (!this.isAudioRecording) {
        console.warn('No audio recording in progress')
        return null
      }

      this.audioCapture.stopRecording()
      this.isAudioRecording = false

      const mainWindow = this.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send(this.PROCESSING_EVENTS.AUDIO_RECORDING_STOP)
      }

      // Wait a bit for the recording to be saved
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const recordingPath = this.audioCapture.getLatestRecording()
      if (recordingPath) {
        // Process the audio to text
        try {
          const transcription = await this.processingHelper.processAudioFile(recordingPath)
          if (mainWindow) {
            mainWindow.webContents.send(this.PROCESSING_EVENTS.AUDIO_TRANSCRIPTION_READY, {
              text: transcription.text,
              filePath: recordingPath,
              timestamp: transcription.timestamp
            })
          }
          return transcription.text
        } catch (transcriptionError) {
          console.error('Error transcribing audio:', transcriptionError)
        }
      }

      return recordingPath
    } catch (error) {
      console.error('Error stopping audio recording:', error)
      return null
    }
  }

  public getIsAudioRecording(): boolean {
    return this.isAudioRecording
  }

  public async getAudioDevices(): Promise<any[]> {
    try {
      return await this.audioCapture.getAudioDevices()
    } catch (error) {
      console.error('Error getting audio devices:', error)
      return []
    }
  }

  // Window management methods
  public createWindow(): void {
    this.windowHelper.createWindow()
  }

  public hideMainWindow(): void {
    this.windowHelper.hideMainWindow()
  }

  public showMainWindow(): void {
    this.windowHelper.showMainWindow()
  }

  public toggleMainWindow(): void {
    console.log(
      "Screenshots: ",
      this.screenshotHelper.getScreenshotQueue().length,
      "Extra screenshots: ",
      this.screenshotHelper.getExtraScreenshotQueue().length,
      "Audio recording: ",
      this.isAudioRecording
    )
    this.windowHelper.toggleMainWindow()
  }

  public setWindowDimensions(width: number, height: number): void {
    this.windowHelper.setWindowDimensions(width, height)
  }

  public clearQueues(): void {
    this.screenshotHelper.clearQueues()

    // Clear problem info
    this.problemInfo = null

    // Stop any ongoing audio recording
    if (this.isAudioRecording) {
      this.stopAudioRecording()
    }

    // Reset view to initial state
    this.setView("queue")
  }

  // Screenshot management methods
  public async takeScreenshot(): Promise<string> {
    if (!this.getMainWindow()) throw new Error("No main window available")

    const screenshotPath = await this.screenshotHelper.takeScreenshot(
      () => this.hideMainWindow(),
      () => this.showMainWindow()
    )

    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    return this.screenshotHelper.getImagePreview(filepath)
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    return this.screenshotHelper.deleteScreenshot(path)
  }

  // New methods to move the window
  public moveWindowLeft(): void {
    this.windowHelper.moveWindowLeft()
  }

  public moveWindowRight(): void {
    this.windowHelper.moveWindowRight()
  }
  public moveWindowDown(): void {
    this.windowHelper.moveWindowDown()
  }
  public moveWindowUp(): void {
    this.windowHelper.moveWindowUp()
  }

  public setHasDebugged(value: boolean): void {
    this.hasDebugged = value
  }

  public getHasDebugged(): boolean {
    return this.hasDebugged
  }
}

// Application initialization
async function initializeApp() {
  const appState = AppState.getInstance()

  // Initialize IPC handlers before window creation
  initializeIpcHandlers(appState)

  app.whenReady().then(() => {
    console.log("App is ready")
    appState.createWindow()
    // Register global shortcuts using ShortcutsHelper
    appState.shortcutsHelper.registerGlobalShortcuts()

    // Clean up old audio recordings on startup
    appState.audioCapture.cleanupOldRecordings()
  })

  app.on("activate", () => {
    console.log("App activated")
    if (appState.getMainWindow() === null) {
      appState.createWindow()
    }
  })

  // Quit when all windows are closed, except on macOS
  app.on("window-all-closed", () => {
    // Stop any ongoing recordings before quitting
    if (appState.getIsAudioRecording()) {
      appState.stopAudioRecording()
    }
    
    if (process.platform !== "darwin") {
      app.quit()
    }
  })

  app.dock?.hide() // Hide dock icon (optional)
  app.commandLine.appendSwitch("disable-background-timer-throttling")
}

// Start the application
initializeApp().catch(console.error)
