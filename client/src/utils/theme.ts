import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#3158a6', dark: '#254581', light: '#e8eef9' },
    background: { default: '#eef1f5', paper: '#ffffff' },
    text: { primary: '#222b3a', secondary: '#687386' },
    divider: '#dde2ea',
  },
  typography: {
    fontFamily: 'Roboto, Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 500 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});

