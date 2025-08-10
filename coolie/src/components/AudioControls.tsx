// src/components/AudioControls.tsx
import React, { useState, useEffect } from 'react'
import { Mic, MicOff, Volume2, VolumeX, Settings } from 'lucide-react'

interface AudioDevice {
  deviceId: string
  label: string
  kind: string
}

interface AudioControlsProps {
  className?: string
  onTranscriptionReady?: (text: string) => void
}

const AudioControls: React.FC<AudioControlsProps> = ({ 
  className = '', 
  onTranscriptionReady 
}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [showDeviceSelect, setShowDeviceSelect] = useState(false)
  const [lastTranscription, setLastTranscription] = useState<string>('')
  const [recordingDuration, setRecordingDuration] = useState(0)

  // Load audio devices on component mount
  useEffect(() => {
    loadAudioDevices()
  }, [])

  // Set up event listeners
  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onAudioRecordingStart(() => {
        setIsRecording(true)
        setIsLoading(false)
        startTimer()
      }),
      
      window.electronAPI.onAudioRecordingStop(() => {
        setIsRecording(false)
        setIsLoading(true)
        stopTimer()
      }),
      
      window.electronAPI.onAudioTranscriptionReady((data) => {
        setLastTranscription(data.text)
        setIsLoading(false)
        if (onTranscriptionReady) {
          onTranscriptionReady(data.text)
        }
      }),

      window.electronAPI.onMeetingAudioStarted(() => {
        setIsRecording(true)
        setIsLoading(false)
        startTimer()
      })
    ]

    // Check current recording status
    checkRecordingStatus()

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup())
      stopTimer()
    }
  }, [onTranscriptionReady])

  // Timer for recording duration
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null)

  const startTimer = () => {
    setRecordingDuration(0)
    const interval = setInterval(() => {
      setRecordingDuration(prev => prev + 1)
    }, 1000)
    setTimerInterval(interval)
  }

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval)
      setTimerInterval(null)
    }
    setRecordingDuration(0)
  }

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const loadAudioDevices = async () => {
    try {
      const result = await window.electronAPI.getAudioDevices()
      if (result.success && result.devices) {
        setAudioDevices(result.devices)
        // Select first device by default
        if (result.devices.length > 0 && !selectedDevice) {
          setSelectedDevice(result.devices[0].deviceId)
        }
      }
    } catch (error) {
      console.error('Error loading audio devices:', error)
    }
  }

  const checkRecordingStatus = async () => {
    try {
      const result = await window.electronAPI.getAudioRecordingStatus()
      if (result.isRecording) {
        setIsRecording(true)
        startTimer()
      }
    } catch (error) {
      console.error('Error checking recording status:', error)
    }
  }

  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        setIsLoading(true)
        const result = await window.electronAPI.stopAudioRecording()
        if (!result.success) {
          console.error('Failed to stop recording:', result.error)
          setIsLoading(false)
        }
      } else {
        setIsLoading(true)
        const result = await window.electronAPI.startAudioRecording(selectedDevice || undefined)
        if (!result.success) {
          console.error('Failed to start recording:', result.error)
          setIsLoading(false)
        }
      }
    } catch (error) {
      console.error('Error toggling recording:', error)
      setIsLoading(false)
    }
  }

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDevice(deviceId)
    setShowDeviceSelect(false)
  }

  return (
    <div className={`flex items-center gap-3 p-3 bg-black/70 backdrop-blur-md rounded-lg border border-white/10 ${className}`}>
      {/* Recording Status Indicator */}
      <div className="flex items-center gap-2">
        {isRecording && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-white font-mono">
              {formatDuration(recordingDuration)}
            </span>
          </div>
        )}
        {isLoading && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span className="text-xs text-white/70">Processing...</span>
          </div>
        )}
      </div>

      {/* Main Recording Button */}
      <button
        onClick={handleToggleRecording}
        disabled={isLoading}
        className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 ${
          isRecording
            ? 'bg-red-500 hover:bg-red-600 shadow-red-500/50'
            : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/50'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : 'shadow-lg hover:shadow-xl cursor-pointer'}
        disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isRecording ? 'Stop Recording (Ctrl+Shift+A)' : 'Start Recording (Ctrl+Shift+A)'}
      >
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : isRecording ? (
          <MicOff className="w-5 h-5 text-white" />
        ) : (
          <Mic className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Device Selection */}
      <div className="relative">
        <button
          onClick={() => setShowDeviceSelect(!showDeviceSelect)}
          className="flex items-center justify-center w-8 h-8 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
          title="Select Audio Device"
        >
          <Settings className="w-4 h-4 text-white/70" />
        </button>

        {showDeviceSelect && (
          <div className="absolute top-full right-0 mt-2 w-64 bg-black/90 backdrop-blur-md rounded-lg border border-white/20 shadow-xl z-50">
            <div className="p-2">
              <div className="text-xs text-white/70 mb-2 px-2">Audio Input Device</div>
              <div className="max-h-40 overflow-y-auto">
                {audioDevices.map((device) => (
                  <button
                    key={device.deviceId}
                    onClick={() => handleDeviceChange(device.deviceId)}
                    className={`w-full text-left px-2 py-2 text-xs rounded hover:bg-white/10 transition-colors ${
                      selectedDevice === device.deviceId
                        ? 'bg-blue-500/30 text-blue-200'
                        : 'text-white/80'
                    }`}
                  >
                    {device.label || `Device ${device.deviceId.slice(0, 8)}...`}
                  </button>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-white/10">
                <div className="text-xs text-white/50 px-2">
                  💡 System + Microphone audio will be captured
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Recording Info */}
      <div className="flex-1 min-w-0">
        {lastTranscription && (
          <div className="bg-white/5 rounded-md p-2">
            <div className="text-xs text-white/50 mb-1">Last Transcription:</div>
            <div className="text-xs text-white/80 line-clamp-2">
              {lastTranscription}
            </div>
          </div>
        )}
      </div>

      {/* Quick Start Meeting Button */}
      <button
        onClick={async () => {
          if (!isRecording) {
            setIsLoading(true)
            try {
              const result = await window.electronAPI.startAudioRecording()
              if (!result.success) {
                console.error('Failed to start meeting recording:', result.error)
                setIsLoading(false)
              }
            } catch (error) {
              console.error('Error starting meeting recording:', error)
              setIsLoading(false)
            }
          }
        }}
        disabled={isRecording || isLoading}
        className="flex items-center gap-1 px-3 py-2 text-xs bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md transition-colors"
        title="Quick Start for Online Meeting (Ctrl+Shift+M)"
      >
        <Volume2 className="w-3 h-3" />
        Meeting
      </button>
    </div>
  )
}

export default AudioControls
