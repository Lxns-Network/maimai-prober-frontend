import { useRef, useEffect, useCallback, useState } from 'react';
import { AudioManager, AudioManagerConfig } from '../core/audio/AudioManager';
import { Note, AudioConfig } from '../types';
import { ANSWER_SOUND_BASE_OFFSET_MS } from '../utils/constants';

export interface UseAudioOptions extends AudioManagerConfig {
  autoInit?: boolean;
}

export interface UseAudioReturn {
  init: () => Promise<void>;
  resume: () => Promise<void>;
  tick: (notes: Note[] | null, currentTimeMs: number) => void;
  reset: (currentTimeMs?: number) => void;
  isInitialized: boolean;
  config: AudioConfig;
  setEnabled: (enabled: boolean) => void;
  setHoldEndSoundEnabled: (enabled: boolean) => void;
  setTouchSoundEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setTimingOffset: (offsetMs: number) => void;
}

const defaultConfig: AudioConfig = {
  enabled: false,
  holdEndSoundEnabled: true,
  touchSoundEnabled: true,
  volume: 0.5,
  timingOffsetMs: ANSWER_SOUND_BASE_OFFSET_MS,
};

export function useAudio(options: UseAudioOptions = {}): UseAudioReturn {
  const { autoInit = false, ...managerConfig } = options;
  const managerRef = useRef<AudioManager | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [config, setConfig] = useState<AudioConfig>(defaultConfig);

  useEffect(() => {
    managerRef.current = new AudioManager(managerConfig);

    if (autoInit) {
      managerRef.current.init().then(() => {
        setIsInitialized(true);
        if (managerRef.current) setConfig(managerRef.current.getConfig());
      });
    }

    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  const init = useCallback(async () => {
    if (!managerRef.current) return;
    await managerRef.current.init();
    setIsInitialized(managerRef.current.isInitialized());
    setConfig(managerRef.current.getConfig());
  }, []);

  const resume = useCallback(async () => {
    await managerRef.current?.resume();
  }, []);

  const tick = useCallback((notes: Note[] | null, currentTimeMs: number) => {
    managerRef.current?.tick(notes, currentTimeMs);
  }, []);

  const reset = useCallback((currentTimeMs?: number) => {
    managerRef.current?.reset(currentTimeMs);
  }, []);

  const updateConfig = useCallback(() => {
    if (managerRef.current) setConfig(managerRef.current.getConfig());
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    managerRef.current?.setEnabled(enabled);
    updateConfig();
  }, [updateConfig]);

  const setHoldEndSoundEnabled = useCallback((enabled: boolean) => {
    managerRef.current?.setHoldEndSoundEnabled(enabled);
    updateConfig();
  }, [updateConfig]);

  const setTouchSoundEnabled = useCallback((enabled: boolean) => {
    managerRef.current?.setTouchSoundEnabled(enabled);
    updateConfig();
  }, [updateConfig]);

  const setVolume = useCallback((volume: number) => {
    managerRef.current?.setVolume(volume);
    updateConfig();
  }, [updateConfig]);

  const setTimingOffset = useCallback((offsetMs: number) => {
    managerRef.current?.setTimingOffset(offsetMs);
    updateConfig();
  }, [updateConfig]);

  return {
    init,
    resume,
    tick,
    reset,
    isInitialized,
    config,
    setEnabled,
    setHoldEndSoundEnabled,
    setTouchSoundEnabled,
    setVolume,
    setTimingOffset,
  };
}

export default useAudio;
