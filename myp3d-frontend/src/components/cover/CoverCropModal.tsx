import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';
import { Check, X, ZoomIn } from 'lucide-react';
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
  if (!isOpen || !cropSource) {
    return null;
  }

  return (
    <div className="crop-modal-backdrop">
      <div className="crop-modal glass" role="dialog" aria-label="Crop cover">
        <div className="cropper-wrap">
          <Cropper
            image={cropSource}
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
      </div>
    </div>
  );
}
