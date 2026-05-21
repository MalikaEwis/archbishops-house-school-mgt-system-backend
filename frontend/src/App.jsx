import { RouterProvider } from 'react-router-dom';
import { AuthProvider }   from './auth/AuthContext';
import { ThemeProvider }  from './context/ThemeContext';
import router             from './router/index';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  );
}
