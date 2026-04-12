import { useState } from 'react';
import type { Area, Point } from 'react-easy-crop';

const COVER_SIZE = 500;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load selected image'));
    image.src = src;
  });

const getCroppedCoverDataUrl = async (imageSrc: string, cropArea: Area): Promise<string> => {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = COVER_SIZE;
  canvas.height = COVER_SIZE;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to initialize crop canvas');
  }

  ctx.drawImage(
    image,
    cropArea.x,
    cropArea.y,
    cropArea.width,
    cropArea.height,
    0,
    0,
    COVER_SIZE,
    COVER_SIZE,
  );

  return canvas.toDataURL('image/jpeg', 0.92);
};

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read selected cover image'));
    reader.readAsDataURL(file);
  });

interface UseCoverImageCropOptions {
  onError: (message: string) => void;
  onClearError?: () => void;
  outputFilename?: string;
}

export function useCoverImageCrop({
  onError,
  onClearError,
  outputFilename = 'cover.jpg',
}: UseCoverImageCropOptions) {
  const [coverImageBase64, setCoverImageBase64] = useState<string | undefined>(undefined);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);

  const handleCoverFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onError('Cover file must be an image');
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setCropSource(dataUrl);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setIsCropModalOpen(true);
      onClearError?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Invalid cover image');
    }
  };

  const handleApplyCrop = async () => {
    if (!cropSource || !croppedAreaPixels) {
      onError('Please adjust the crop before applying');
      return;
    }

    try {
      setIsApplyingCrop(true);
      const croppedImage = await getCroppedCoverDataUrl(cropSource, croppedAreaPixels);
      const blob = await fetch(croppedImage).then((response) => response.blob());

      setCoverImageBase64(croppedImage);
      setCoverFile(new File([blob], outputFilename, { type: 'image/jpeg' }));
      setCoverPreview(croppedImage);
      setIsCropModalOpen(false);
      setCropSource(null);
      onClearError?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to crop image');
    } finally {
      setIsApplyingCrop(false);
    }
  };

  const handleCancelCrop = () => {
    setIsCropModalOpen(false);
    setCropSource(null);
  };

  const handleRemoveCover = () => {
    setCoverImageBase64(undefined);
    setCoverFile(null);
    setCoverPreview(null);
    setCropSource(null);
  };

  const resetCoverState = () => {
    setCoverImageBase64(undefined);
    setCoverFile(null);
    setCoverPreview(null);
    setCropSource(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setIsCropModalOpen(false);
  };

  const handleCropComplete = (_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  };

  return {
    coverImageBase64,
    coverFile,
    coverPreview,
    cropSource,
    crop,
    zoom,
    isCropModalOpen,
    isApplyingCrop,
    setCrop,
    setZoom,
    handleCropComplete,
    handleCoverFileSelect,
    handleApplyCrop,
    handleCancelCrop,
    handleRemoveCover,
    resetCoverState,
  };
}
