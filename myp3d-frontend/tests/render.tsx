import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import App from '../src/App';

export function renderApp(path = '/dashboard') {
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(<RouterProvider router={router} />);
  return { ...view, router, user };
}
