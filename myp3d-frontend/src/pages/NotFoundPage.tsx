import { LayoutDashboard, SearchX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="page">
      <EmptyState icon={SearchX} label="Page not found">
        <IconButton icon={LayoutDashboard} label="Go to the dashboard" onClick={() => navigate('/dashboard')} />
      </EmptyState>
    </div>
  );
}
