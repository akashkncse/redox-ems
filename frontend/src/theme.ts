import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#04eb7b' },
    secondary: { main: '#29b6f6' },
    background: { default: '#121212', paper: '#1e1e1e' },
    text: { primary: '#ffffff', secondary: '#b0bec5' },
  },
  typography: {
    fontFamily: '"JetBrains Mono", monospace',
  },
  shape: { borderRadius: 8 },
});

export default theme;