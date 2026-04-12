import Cropper from 'react-easy-crop';
import type { Area, Point } from 'react-easy-crop';

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
      <div className="crop-modal">
        <h3>Crop Cover</h3>
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
        <label className="crop-zoom-label" htmlFor={zoomInputId}>
          Zoom: {zoom.toFixed(2)}x
        </label>
        <input
          id={zoomInputId}
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(event) => onZoomChange(Number(event.target.value))}
          className="crop-zoom-slider"
        />
        <div className="crop-actions">
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={isApplyingCrop}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={onApply} disabled={isApplyingCrop}>
            {isApplyingCrop ? 'Applying...' : 'Use Crop'}
          </button>
        </div>
      </div>
    </div>
  );
}
