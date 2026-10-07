import {
  AppWindow,
  AudioLines,
  Camera,
  Check,
  Circle,
  Download,
  Info,
  Mic,
  MicOff,
  Monitor,
  Moon,
  MousePointer2,
  PanelTop,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Square,
  Sun,
  Timer,
  TriangleAlert,
  Volume2,
  X
} from 'lucide';
import { createIcons } from 'lucide';

export const ICONS = {
  AppWindow,
  AudioLines,
  Camera,
  Check,
  Circle,
  Download,
  Info,
  Mic,
  MicOff,
  Monitor,
  Moon,
  MousePointer2,
  PanelTop,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Square,
  Sun,
  Timer,
  TriangleAlert,
  Volume2,
  X
};

export function refreshIcons(): void {
  createIcons({ icons: ICONS, nameAttr: 'data-lucide' });
}

export function icon(name: string, hidden = true): string {
  return `<i data-lucide="${name}"${hidden ? ' aria-hidden="true"' : ''}></i>`;
}
