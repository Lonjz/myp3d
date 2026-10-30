import { useRef } from 'react';
import type { ReactNode } from 'react';
import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { Check, X, ZoomIn } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { useLingering } from '../../hooks/usePresence';
import { IconButton } from '../ui/IconButton';

interface CoverCropModalProps {
  isOpen: boolean;
  cropSource: string | null;
  crop: Point;
  zoom: number;
  isApplyingCrop: boolean;
  zoomInputId: string;
  onCropChange: (crop: Point) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  onCancel: () => void;
  onApply: () => void;
}

function CropDialog({ closing, busy, onCancel, children }: { closing: boolean; busy: boolean; onCancel: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialog(panelRef, { onClose: onCancel, locked: busy || closing });

  return (
    <div className="crop-modal-backdrop motion-fade" data-state={closing ? 'closed' : 'open'}>
      <div ref={panelRef} className="crop-modal glass motion-pop" role="dialog" aria-modal="true" aria-label="Crop cover" tabIndex={-1}>
        {children}
      </div>
    </div>
  );
}

export function CoverCropModal({
  isOpen,
  cropSource,
  crop,
  zoom,
  isApplyingCrop,
  zoomInputId,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onCancel,
  onApply,
}: CoverCropModalProps) {
  const { value: source, closing } = useLingering(isOpen ? cropSource : null);
  if (!source) return null;

  return (
    <CropDialog closing={closing} busy={isApplyingCrop} onCancel={onCancel}>
      <div className="cropper-wrap">
        <Cropper
          image={source}
          crop={crop}
          zoom={zoom}
          aspect={1}
          minZoom={1}
          maxZoom={3}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropComplete}
          objectFit="contain"
        />
      </div>
      <label className="crop-zoom" htmlFor={zoomInputId} title="Zoom">
        <ZoomIn aria-hidden="true" />
        <input
          id={zoomInputId}
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(event) => onZoomChange(Number(event.target.value))}
          aria-label="Zoom"
        />
      </label>
      <div className="crop-actions">
        <IconButton icon={X} label="Cancel" onClick={onCancel} disabled={isApplyingCrop} />
        <IconButton icon={Check} label="Apply crop" variant="primary" onClick={onApply} disabled={isApplyingCrop} />
      </div>
    </CropDialog>
  );
}
