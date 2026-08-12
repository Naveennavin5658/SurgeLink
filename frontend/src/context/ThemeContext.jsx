import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'surgelink-theme';

function getInitialTheme() {
  return 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
    window.localStorage.setItem(STORAGE_KEY, 'light');
    setTheme('light');
  }, []);

  const toggleTheme = () => {
    setTheme('light');
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.colorScheme = 'light';
    window.localStorage.setItem(STORAGE_KEY, 'light');
  };

  const value = useMemo(() => ({ theme: 'light', toggleTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
