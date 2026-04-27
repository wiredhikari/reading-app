// Kept as a back-compat re-export. The cycle-style ThemeToggle was replaced
// by a dropdown picker (ThemePicker) when we expanded from 3 to 10 themes —
// any older imports of ThemeToggle resolve here without breaking.
export { default } from './ThemePicker';
