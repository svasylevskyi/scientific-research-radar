import { createTheme, responsiveFontSizes } from "@mui/material/styles";

let theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#087d67",
      dark: "#075d50",
      light: "#46bba0",
      contrastText: "#ffffff",
    },
    secondary: { main: "#2b62c8" },
    background: { default: "#f5f8fa", paper: "#ffffff" },
    text: { primary: "#102333", secondary: "#5b6b78" },
    divider: "#dce5ea",
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h2: { fontWeight: 780, letterSpacing: "-0.04em", fontSize: "2.45rem", lineHeight: 1.1 },
    h3: { fontWeight: 780, letterSpacing: "-0.035em", fontSize: "2rem", lineHeight: 1.15 },
    h6: { fontWeight: 750, letterSpacing: "-0.015em" },
    button: { fontWeight: 750, textTransform: "none", letterSpacing: "-0.01em" },
    body1: { fontSize: "1rem", lineHeight: 1.6 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 12, boxShadow: "none" },
        contained: { boxShadow: "0 9px 22px rgba(8, 125, 103, 0.2)" },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 12, backgroundColor: "#ffffff" },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: { margin: 0 },
        "*": { boxSizing: "border-box" },
        "::selection": { backgroundColor: "rgba(31, 181, 147, 0.25)" },
      },
    },
  },
});

theme = responsiveFontSizes(theme);

export default theme;

