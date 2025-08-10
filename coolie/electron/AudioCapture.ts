// electron/AudioCapture.ts
import { app, desktopCapturer, systemPreferences } from "electron"
import fs from "fs"
import path from "path"
import { v4 as uuidv4 } from "uuid"

interface AudioDevice {
  deviceId: string
  label: string
  kind: string
}

export class AudioCapture {
  private isRecording = false
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private audioDir: string
  private currentRecordingPath: string | null = null
  
  constructor() {
    this.audioDir = path.join(app.getPath("userData"), "audio_recordings")
    if (!fs.existsSync(this.audioDir)) {
      fs.mkdirSync(this.audioDir, { recursive: true })
    }
  }

  // Request microphone permissions
  private async requestMicrophonePermission(): Promise<boolean> {
    try {
      if (process.platform === 'darwin') {
        const status = await systemPreferences.askForMediaAccess('microphone')
        return status
      }
      return true // Assume granted on other platforms
    } catch (error) {
      console.error('Error requesting microphone permission:', error)
      return false
    }
  }

  // Get available audio devices
  public async getAudioDevices(): Promise<AudioDevice[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Audio Device ${device.deviceId}`,
          kind: device.kind
        }))
    } catch (error) {
      console.error('Error getting audio devices:', error)
      return []
    }
  }

  // Capture system audio (for online meetings)
  public async captureSystemAudio(): Promise<MediaStream | null> {
    try {
      // For system audio capture, we need to use screen capture with audio
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 }
      })

      if (sources.length === 0) {
        throw new Error('No screen sources available')
      }

      // Use the first screen source
      const screenSource = sources[0]
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: screenSource.id
          }
        } as any,
        video: false
      })

      return stream
    } catch (error) {
      console.error('Error capturing system audio:', error)
      return null
    }
  }

  // Capture microphone audio
  public async captureMicrophoneAudio(deviceId?: string): Promise<MediaStream | null> {
    try {
      const hasPermission = await this.requestMicrophonePermission()
      if (!hasPermission) {
        throw new Error('Microphone permission denied')
      }

      const constraints: MediaStreamConstraints = {
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      return stream
    } catch (error) {
      console.error('Error capturing microphone audio:', error)
      return null
    }
  }

  // Mix multiple audio streams
  private mixAudioStreams(streams: MediaStream[]): MediaStream {
    const audioContext = new AudioContext()
    const destination = audioContext.createMediaStreamDestination()

    streams.forEach(stream => {
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(destination)
    })

    return destination.stream
  }

  // Start recording with mixed audio (system + microphone)
  public async startMixedRecording(micDeviceId?: string): Promise<string | null> {
    try {
      if (this.isRecording) {
        console.warn('Already recording')
        return null
      }

      const streams: MediaStream[] = []

      // Capture system audio
      const systemStream = await this.captureSystemAudio()
      if (systemStream) {
        streams.push(systemStream)
      }

      // Capture microphone audio
      const micStream = await this.captureMicrophoneAudio(micDeviceId)
      if (micStream) {
        streams.push(micStream)
      }

      if (streams.length === 0) {
        throw new Error('No audio streams available')
      }

      // Mix streams if multiple sources
      const finalStream = streams.length > 1 
        ? this.mixAudioStreams(streams) 
        : streams[0]

      // Create MediaRecorder
      const options = { mimeType: 'audio/webm;codecs=opus' }
      this.mediaRecorder = new MediaRecorder(finalStream, options)
      this.audioChunks = []

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      this.mediaRecorder.onstop = async () => {
        await this.saveRecording()
        this.cleanup()
      }

      this.mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event)
        this.cleanup()
      }

      // Start recording
      this.mediaRecorder.start(1000) // Collect data every second
      this.isRecording = true

      console.log('Started mixed audio recording')
      return 'recording-started'

    } catch (error) {
      console.error('Error starting mixed recording:', error)
      this.cleanup()
      return null
    }
  }

  // Stop recording
  public stopRecording(): void {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop()
      this.isRecording = false
      console.log('Stopped audio recording')
    }
  }

  // Save the recording to file
  private async saveRecording(): Promise<void> {
    if (this.audioChunks.length === 0) return

    try {
      const blob = new Blob(this.audioChunks, { type: 'audio/webm' })
      const filename = `recording_${uuidv4()}.webm`
      this.currentRecordingPath = path.join(this.audioDir, filename)

      // Convert blob to buffer and save
      const arrayBuffer = await blob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      await fs.promises.writeFile(this.currentRecordingPath, buffer)
      console.log('Recording saved to:', this.currentRecordingPath)

    } catch (error) {
      console.error('Error saving recording:', error)
    }
  }

  // Cleanup resources
  private cleanup(): void {
    this.audioChunks = []
    this.mediaRecorder = null
    this.isRecording = false
  }

  // Get the latest recording path
  public getLatestRecording(): string | null {
    return this.currentRecordingPath
  }

  // Check if currently recording
  public getIsRecording(): boolean {
    return this.isRecording
  }

  // Clean up old recordings (keep last 10)
  public async cleanupOldRecordings(): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.audioDir)
      const audioFiles = files
        .filter(file => file.endsWith('.webm'))
        .map(file => ({
          name: file,
          path: path.join(this.audioDir, file),
          stats: fs.statSync(path.join(this.audioDir, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())

      // Keep only the latest 10 recordings
      const filesToDelete = audioFiles.slice(10)
      
      for (const file of filesToDelete) {
        await fs.promises.unlink(file.path)
        console.log('Deleted old recording:', file.name)
      }
    } catch (error) {
      console.error('Error cleaning up old recordings:', error)
    }
  }
}
