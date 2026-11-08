import { createStrictContext } from '../../utils/strictContext';

export interface ToastContextValue {
  showSuccess: (text: string) => void;
  showError: (text: string) => void;
  showInfo: (text: string) => void;
  clearToast: () => void;
}

export const [ToastContext, useToast] = createStrictContext<ToastContextValue>('useToast');
